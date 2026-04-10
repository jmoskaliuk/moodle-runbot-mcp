<?php
// This file is part of local_runbotadmin — eLeDia Moodle Runbot Admin Plugin.
//
// Dieses Plugin läuft nur in Demo-Instanzen, die vom Runbot-MCP-Server gestartet
// wurden. Es gibt Admins eine native GUI zum Erzeugen, Listen und Verwalten von
// Snapshots direkt aus Moodle heraus — kein externes MCP-Tool nötig.
//
// Siehe task37 im moodle-runbot-mcp Projekt für das vollständige Konzept.

defined('MOODLE_INTERNAL') || die();

$plugin->component = 'local_runbotadmin';
$plugin->version   = 2026041001;   // YYYYMMDDXX — task37b: download/delete/set-default
$plugin->requires  = 2023100900;   // Moodle 4.3+ (Hooks API)
$plugin->maturity  = MATURITY_ALPHA;
$plugin->release   = '0.2.0-snapshot-actions';
