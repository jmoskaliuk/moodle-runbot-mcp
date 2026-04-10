<?php
// Language strings for local_runbotadmin (English).

defined('MOODLE_INTERNAL') || die();

$string['pluginname']         = 'eLeDia Runbot Admin';
$string['runbotadmin:manage'] = 'Manage Runbot snapshots and plugins';
$string['nav_snapshots']      = 'Snapshots';
$string['nav_plugins']        = 'Plugins';
$string['nav_metadata']       = 'Metadata';
$string['page_title']         = 'Runbot Admin Console';
$string['page_intro']         = 'Native interface for snapshot and plugin management of this Moodle demo instance.';

// Snapshots tab
$string['snap_heading']       = 'Snapshots of this demo plugin';
$string['snap_intro']         = 'Capture the current database state as a snapshot. Future demo sessions for the same plugin will start from the snapshot you mark as default.';
$string['snap_label']         = 'Label';
$string['snap_label_help']    = 'Short, machine-friendly identifier (letters, digits, hyphens). Example: "leitnerflow-v2".';
$string['snap_description']   = 'Description';
$string['snap_description_help'] = 'Human-readable note explaining what changed in this snapshot.';
$string['snap_create_btn']    = 'Save current state as snapshot';
$string['snap_creating']      = 'Creating snapshot…';
$string['snap_created']       = 'Snapshot created successfully.';
$string['snap_create_failed'] = 'Failed to create snapshot: {$a}';
$string['snap_list_heading']  = 'Existing snapshots';
$string['snap_empty']         = 'No snapshots yet for this plugin.';
$string['snap_col_label']     = 'Label';
$string['snap_col_created']   = 'Created';
$string['snap_col_size']      = 'Size';
$string['snap_col_actions']   = 'Actions';

// Snapshot row actions (task37b)
$string['snap_act_download']     = 'Download';
$string['snap_act_delete']       = 'Delete';
$string['snap_act_setdefault']   = 'Set as default';
$string['snap_is_default']       = 'Default';
$string['snap_default_hint']     = 'New demo sessions start from this snapshot.';
$string['snap_delete_confirm']   = 'Really delete snapshot "{$a}"? This cannot be undone.';
$string['snap_deleted']          = 'Snapshot "{$a}" deleted.';
$string['snap_delete_failed']    = 'Failed to delete snapshot: {$a}';
$string['snap_set_default_ok']   = 'Snapshot "{$a}" is now the default for new demos.';
$string['snap_set_default_failed'] = 'Failed to set default snapshot: {$a}';
$string['snap_download_failed']  = 'Failed to download snapshot: {$a}';

// Errors
$string['err_not_in_runbot']  = 'This page only works inside a Runbot-managed demo instance. The $CFG->runbot_instance_id configuration is missing.';
$string['err_api_token']      = 'Runbot API token missing or invalid in $CFG->runbot_api_token.';
$string['err_http']           = 'Backend request failed: HTTP {$a->code} — {$a->body}';
$string['err_label_invalid']  = 'Label must only contain letters, digits and hyphens.';

// Privacy
$string['privacy:metadata']   = 'The eLeDia Runbot Admin plugin does not store any personal data. It only talks to the Runbot MCP server to manage snapshots and plugin metadata for the current demo instance.';
