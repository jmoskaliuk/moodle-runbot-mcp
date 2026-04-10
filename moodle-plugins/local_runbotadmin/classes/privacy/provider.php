<?php
// Privacy provider for local_runbotadmin.
//
// The plugin doesn't store any personal data — it only talks to the Runbot
// MCP backend to manage snapshots of the current demo instance. Therefore we
// implement the null_provider to satisfy Moodle's privacy framework without
// false claims of data handling.

namespace local_runbotadmin\privacy;

defined('MOODLE_INTERNAL') || die();

class provider implements \core_privacy\local\metadata\null_provider {

    public static function get_reason(): string {
        return 'privacy:metadata';
    }
}
