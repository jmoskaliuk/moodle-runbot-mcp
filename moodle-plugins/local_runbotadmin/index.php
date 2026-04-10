<?php
// Main entry point for the Runbot Admin Console.
//
// Flow:
//   1. Require admin login (is_siteadmin + capability check)
//   2. Read instance context from $CFG->runbot_instance_id (set by
//      Runbot-Server's patchConfigForProduction())
//   3. Dispatch POST actions: create | delete | setdefault | download
//   4. Render the page: intro + create-snapshot form + list of existing
//      snapshots (fetched live from the backend)
//
// task37b — Snapshots tab now supports Download, Delete, and Set-Default
// actions. Plugin-Management and Metadata tabs remain stubs (future).

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

// ── Handle actions ───────────────────────────────────────────────────────────
//
// We route GET?action=download separately (before Moodle's output starts)
// because it streams binary data and must not be preceded by a rendered
// page header. All other actions run inside the normal page lifecycle.

$action = optional_param('action', '', PARAM_ALPHA);

// --- action=download (GET, streams binary) ---
if ($action === 'download' && confirm_sesskey()) {
    $snapshotid = required_param('snapshotId', PARAM_TEXT);
    try {
        $client = new \local_runbotadmin\api_client();
        $client->stream_snapshot_download($snapshotid);
    } catch (\Throwable $e) {
        // Wenn das hier schief geht ist der Body evtl. schon teilweise
        // ausgegeben — wir können nur noch abbrechen.
        http_response_code(500);
        echo 'Download failed: ' . s($e->getMessage());
    }
    exit;
}

$flash = null;  // ['type' => 'success'|'error', 'msg' => string]

// --- action=create ---
if ($action === 'create' && confirm_sesskey()) {
    $label       = trim(required_param('label', PARAM_RAW));
    $description = trim(optional_param('description', '', PARAM_RAW));

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

// --- action=delete ---
if ($action === 'delete' && confirm_sesskey()) {
    $snapshotid = required_param('snapshotId', PARAM_TEXT);
    try {
        $client = new \local_runbotadmin\api_client();
        $client->delete_snapshot($snapshotid);
        $flash = [
            'type' => 'success',
            'msg'  => get_string('snap_deleted', 'local_runbotadmin', s($snapshotid)),
        ];
    } catch (\Throwable $e) {
        $flash = [
            'type' => 'error',
            'msg'  => get_string('snap_delete_failed', 'local_runbotadmin', s($e->getMessage())),
        ];
    }
}

// --- action=setdefault ---
if ($action === 'setdefault' && confirm_sesskey()) {
    $snapshotid = required_param('snapshotId', PARAM_TEXT);
    try {
        $client = new \local_runbotadmin\api_client();
        $client->set_default_snapshot($snapshotid);
        $flash = [
            'type' => 'success',
            'msg'  => get_string('snap_set_default_ok', 'local_runbotadmin', s($snapshotid)),
        ];
    } catch (\Throwable $e) {
        $flash = [
            'type' => 'error',
            'msg'  => get_string('snap_set_default_failed', 'local_runbotadmin', s($e->getMessage())),
        ];
    }
}

// ── Fetch current snapshot list for display ──────────────────────────────────
$snapshots = [];
$defaultSnapshotId = null;
$listerr = null;
try {
    $client = new \local_runbotadmin\api_client();
    $listResponse = $client->list_snapshots();
    $snapshots = $listResponse['snapshots'] ?? [];
    $defaultSnapshotId = $listResponse['defaultSnapshot'] ?? null;
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

// Tabs scaffold — Snapshots functional; Plugins/Metadata still deferred.
echo '<ul class="runbotadmin-tabs">';
echo '  <li class="active">'. get_string('nav_snapshots', 'local_runbotadmin') .'</li>';
echo '  <li class="disabled" title="task37c">'. get_string('nav_plugins', 'local_runbotadmin') .'</li>';
echo '  <li class="disabled" title="task37c">'. get_string('nav_metadata', 'local_runbotadmin') .'</li>';
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
    echo '  <table class="generaltable runbotadmin-snaps">';
    echo '    <thead><tr>';
    echo '      <th>'. get_string('snap_col_label', 'local_runbotadmin') .'</th>';
    echo '      <th>'. get_string('snap_col_created', 'local_runbotadmin') .'</th>';
    echo '      <th>'. get_string('snap_col_size', 'local_runbotadmin') .'</th>';
    echo '      <th>'. get_string('snap_col_actions', 'local_runbotadmin') .'</th>';
    echo '    </tr></thead>';
    echo '    <tbody>';

    $deletestr     = get_string('snap_act_delete', 'local_runbotadmin');
    $downloadstr   = get_string('snap_act_download', 'local_runbotadmin');
    $setdefstr     = get_string('snap_act_setdefault', 'local_runbotadmin');
    $defaultbadge  = get_string('snap_is_default', 'local_runbotadmin');

    foreach ($snapshots as $s) {
        $snapid = $s['snapshotId'] ?? '';
        $label  = $s['label'] ?? $snapid;
        $size   = isset($s['sizeBytes']) ? display_size((int)$s['sizeBytes']) : '—';
        $created = isset($s['createdAt']) ? userdate(strtotime($s['createdAt'])) : '—';
        $isdefault = !empty($s['isDefault']) || ($defaultSnapshotId !== null && $snapid === $defaultSnapshotId);

        echo '      <tr>';
        echo '        <td>';
        echo            s($label);
        if ($isdefault) {
            echo '        <span class="badge badge-success runbotadmin-default-badge" title="'. s(get_string('snap_default_hint', 'local_runbotadmin')) .'">'. s($defaultbadge) .'</span>';
        }
        echo '        </td>';
        echo '        <td>'. s($created) .'</td>';
        echo '        <td>'. s($size) .'</td>';
        echo '        <td class="runbotadmin-actions">';

        // Download (GET) — opens in a new tab so the current page doesn't
        // get replaced if the browser chooses to render instead of save.
        $dlurl = new moodle_url('/local/runbotadmin/index.php', [
            'action'     => 'download',
            'snapshotId' => $snapid,
            'sesskey'    => sesskey(),
        ]);
        echo '          <a class="btn btn-sm btn-secondary" href="'. $dlurl->out(false) .'" target="_blank" rel="noopener">'. s($downloadstr) .'</a> ';

        // Set as default (POST, only if not already default)
        if (!$isdefault) {
            echo '          <form method="post" action="index.php" style="display:inline">';
            echo '            <input type="hidden" name="sesskey" value="'. sesskey() .'">';
            echo '            <input type="hidden" name="action" value="setdefault">';
            echo '            <input type="hidden" name="snapshotId" value="'. s($snapid) .'">';
            echo '            <button type="submit" class="btn btn-sm btn-secondary">'. s($setdefstr) .'</button>';
            echo '          </form> ';
        }

        // Delete (POST with JS confirm) — disabled for the current default,
        // otherwise the confirmation prompt is rendered via onsubmit.
        if (!$isdefault) {
            $confirmmsg = get_string('snap_delete_confirm', 'local_runbotadmin', $label);
            echo '          <form method="post" action="index.php" style="display:inline" onsubmit="return confirm('. json_encode($confirmmsg) .');">';
            echo '            <input type="hidden" name="sesskey" value="'. sesskey() .'">';
            echo '            <input type="hidden" name="action" value="delete">';
            echo '            <input type="hidden" name="snapshotId" value="'. s($snapid) .'">';
            echo '            <button type="submit" class="btn btn-sm btn-danger">'. s($deletestr) .'</button>';
            echo '          </form>';
        }

        echo '        </td>';
        echo '      </tr>';
    }
    echo '    </tbody>';
    echo '  </table>';
}
echo '</div>';

echo $OUTPUT->footer();
