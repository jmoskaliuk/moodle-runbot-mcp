<?php
// Capability definitions for local_runbotadmin.

defined('MOODLE_INTERNAL') || die();

$capabilities = [
    'local/runbotadmin:manage' => [
        'riskbitmask'  => RISK_CONFIG | RISK_DATALOSS,
        'captype'      => 'write',
        'contextlevel' => CONTEXT_SYSTEM,
        'archetypes'   => [
            'manager' => CAP_ALLOW,
        ],
    ],
];
