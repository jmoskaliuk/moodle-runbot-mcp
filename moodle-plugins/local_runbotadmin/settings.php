<?php
// Adds a link "Runbot Admin" to the Site Administration menu.
//
// We intentionally use an external page link instead of a normal admin-settings
// page, because the UI is highly interactive (AJAX snapshot creation) and needs
// its own controller at index.php.

defined('MOODLE_INTERNAL') || die();

if ($hassiteconfig) {
    $ADMIN->add(
        'server',
        new admin_externalpage(
            'local_runbotadmin',
            get_string('pluginname', 'local_runbotadmin'),
            new moodle_url('/local/runbotadmin/index.php'),
            'local/runbotadmin:manage'
        )
    );
}
