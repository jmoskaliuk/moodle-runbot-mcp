<?php
// Main entry point for the Runbot Admin Console.
//
// Flow:
//   1. Require admin login (is_siteadmin + capability check)
//   2. Read instance context from $CFG->runbot_instance_id (set by
//      Runbot-Server's patchConfigForProduction())
//   3. If the current request is a form POST (Create Snapshot),
//      dispatch to the API client and show a success/error banner
//   4. Render the page: intro + create-snapshot form + list of existing
//      snapshots (fetched live from the backend)
//
// This MVP implements only the Snapshots tab. Plugin-Management and
// Metadata tabs are stubs that will be filled in task37b.

require(__DIR__ . '/../../config.php');
require_once($CFG->libdir . '/adminlib.php');

admin_externalpage_setup('local_runbotadmin');
require_capability('local/runbotadmin:manage', \core\context\system::instance());

$PAGE->set_url(new moodle_url('/local/runbotadmin/index.php'));
$PAGE->set_title(get_string('page_title', 'local_runbotadmin'));
$PAGE->set_heading(get_string('page_title', 'local_runbotadmin'));
$PAGE->requires->css('/local/runbotadmin/styles.css');

// Guard: we only work inside a Runbot-managed instance.
if (empty($CFG->runbot_instance_id)) {
    echo $OUTPUT->header();
    echo $OUTPUT->notification(
        get_string('err_not_in_runbot', 'local_runbotadmin'),
        \core\output\notification::NOTIFY_ERROR
    );
    echo $OUTPUT->footer();
    exit;
}

// ── Handle POST: create snapshot ─────────────────────────────────────────────
$flash = null;        // ['type' => 'success'|'error', 'msg' => string]
$action = optional_param('action', '', PARAM_ALPHA);

if ($action === 'create' && confirm_sesskey()) {
    $label       = trim(required_param('label', PARAM_RAW));
    $description = trim(optional_param('description', '', PARAM_RAW));

    // Label sanity check — letters, digits, hyphens only.
    if (!preg_match('/^[a-zA-Z0-9\-]+$/', $label)) {
        $flash = ['type' => 'error', 'msg' => get_string('err_label_invalid', 'local_runbotadmin')];
    } else {
        try {
            $client = new \local_runbotadmin\api_client();
            $result = $client->create_snapshot($label, $description);
            $flash = [
                'type' => 'success',
                'msg'  => get_string('snap_created', 'local_runbotadmin')
                          . ' ('. s($result['snapshotId'] ?? $label) .')',
            ];
        } catch (\Throwable $e) {
            $flash = [
                'type' => 'error',
                'msg'  => get_string('snap_create_failed', 'local_runbotadmin', s($e->getMessage())),
            ];
        }
    }
}

// ── Fetch current snapshot list for display ──────────────────────────────────
$snapshots = [];
$listerr   = null;
try {
    $client = new \local_runbotadmin\api_client();
    $snapshots = $client->list_snapshots();
} catch (\Throwable $e) {
    $listerr = $e->getMessage();
}

// ── Render ───────────────────────────────────────────────────────────────────
echo $OUTPUT->header();

if ($flash !== null) {
    $type = $flash['type'] === 'success'
        ? \core\output\notification::NOTIFY_SUCCESS
        : \core\output\notification::NOTIFY_ERROR;
    echo $OUTPUT->notification($flash['msg'], $type);
}

echo '<div class="runbotadmin-intro">' . get_string('page_intro', 'local_runbotadmin') . '</div>';

// Tabs scaffold — MVP only Snapshots is functional.
echo '<ul class="runbotadmin-tabs">';
echo '  <li class="active">'. get_string('nav_snapshots', 'local_runbotadmin') .'</li>';
echo '  <li class="disabled" title="task37b">'. get_string('nav_plugins', 'local_runbotadmin') .'</li>';
echo '  <li class="disabled" title="task37b">'. get_string('nav_metadata', 'local_runbotadmin') .'</li>';
echo '</ul>';

// Snapshots tab content
echo '<div class="runbotadmin-panel">';
echo '  <h3>'. get_string('snap_heading', 'local_runbotadmin') .'</h3>';
echo '  <p class="runbotadmin-muted">'. get_string('snap_intro', 'local_runbotadmin') .'</p>';

// Create form
echo '  <form method="post" action="index.php" class="runbotadmin-create-form">';
echo '    <input type="hidden" name="sesskey" value="'. sesskey() .'">';
echo '    <input type="hidden" name="action" value="create">';
echo '    <div class="row">';
echo '      <label for="lrba_label">'. get_string('snap_label', 'local_runbotadmin') .'</label>';
echo '      <input id="lrba_label" name="label" type="text" required pattern="[a-zA-Z0-9\-]+" placeholder="leitnerflow-v2">';
echo '    </div>';
echo '    <div class="row">';
echo '      <label for="lrba_desc">'. get_string('snap_description', 'local_runbotadmin') .'</label>';
echo '      <input id="lrba_desc" name="description" type="text" placeholder="'. s(get_string('snap_description_help', 'local_runbotadmin')) .'">';
echo '    </div>';
echo '    <div class="row">';
echo '      <button type="submit" class="btn btn-primary">'. get_string('snap_create_btn', 'local_runbotadmin') .'</button>';
echo '    </div>';
echo '  </form>';

// Snapshot list
echo '  <h4>'. get_string('snap_list_heading', 'local_runbotadmin') .'</h4>';
if ($listerr !== null) {
    echo '  <div class="runbotadmin-error">'. s($listerr) .'</div>';
} else if (empty($snapshots)) {
    echo '  <p class="runbotadmin-muted">'. get_string('snap_empty', 'local_runbotadmin') .'</p>';
} else {
    echo '  <table class="generaltable">';
    echo '    <thead><tr>';
    echo '      <th>'. get_string('snap_col_label', 'local_runbotadmin') .'</th>';
    echo '      <th>'. get_string('snap_col_created', 'local_runbotadmin') .'</th>';
    echo '      <th>'. get_string('snap_col_size', 'local_runbotadmin') .'</th>';
    echo '      <th>'. get_string('snap_col_actions', 'local_runbotadmin') .'</th>';
    echo '    </tr></thead>';
    echo '    <tbody>';
    foreach ($snapshots as $s) {
        $size = isset($s['sizeBytes']) ? display_size((int)$s['sizeBytes']) : '—';
        $created = isset($s['createdAt']) ? userdate(strtotime($s['createdAt'])) : '—';
        echo '      <tr>';
        echo '        <td>'. s($s['label'] ?? $s['snapshotId'] ?? '—') .'</td>';
        echo '        <td>'. s($created) .'</td>';
        echo '        <td>'. s($size) .'</td>';
        echo '        <td class="runbotadmin-muted">task37b</td>';
        echo '      </tr>';
    }
    echo '    </tbody>';
    echo '  </table>';
}
echo '</div>';

echo $OUTPUT->footer();
