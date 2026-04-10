<?php
// Language strings for local_runbotadmin (German).

defined('MOODLE_INTERNAL') || die();

$string['pluginname']         = 'eLeDia Runbot Admin';
$string['runbotadmin:manage'] = 'Runbot-Snapshots und Plugins verwalten';
$string['nav_snapshots']      = 'Snapshots';
$string['nav_plugins']        = 'Plugins';
$string['nav_metadata']       = 'Metadaten';
$string['page_title']         = 'Runbot Admin-Konsole';
$string['page_intro']         = 'Native Oberfläche für Snapshot- und Plugin-Verwaltung dieser Moodle-Demo-Instanz.';

// Snapshots-Tab
$string['snap_heading']       = 'Snapshots dieses Demo-Plugins';
$string['snap_intro']         = 'Speichere den aktuellen Datenbank-Zustand als Snapshot. Künftige Demo-Sitzungen für dasselbe Plugin starten aus dem Snapshot, den du als Standard markierst.';
$string['snap_label']         = 'Bezeichnung';
$string['snap_label_help']    = 'Kurze, maschinen-lesbare ID (Buchstaben, Ziffern, Bindestriche). Beispiel: „leitnerflow-v2".';
$string['snap_description']   = 'Beschreibung';
$string['snap_description_help'] = 'Menschen-lesbare Notiz, was in diesem Snapshot geändert wurde.';
$string['snap_create_btn']    = 'Aktuellen Zustand als Snapshot speichern';
$string['snap_creating']      = 'Snapshot wird erstellt…';
$string['snap_created']       = 'Snapshot erfolgreich erstellt.';
$string['snap_create_failed'] = 'Snapshot konnte nicht erstellt werden: {$a}';
$string['snap_list_heading']  = 'Vorhandene Snapshots';
$string['snap_empty']         = 'Noch keine Snapshots für dieses Plugin vorhanden.';
$string['snap_col_label']     = 'Bezeichnung';
$string['snap_col_created']   = 'Erstellt';
$string['snap_col_size']      = 'Größe';
$string['snap_col_actions']   = 'Aktionen';

// Snapshot Zeilen-Aktionen (task37b)
$string['snap_act_download']       = 'Herunterladen';
$string['snap_act_delete']         = 'Löschen';
$string['snap_act_setdefault']     = 'Als Standard';
$string['snap_is_default']         = 'Standard';
$string['snap_default_hint']       = 'Neue Demo-Sitzungen starten aus diesem Snapshot.';
$string['snap_delete_confirm']     = 'Snapshot „{$a}" wirklich löschen? Das kann nicht rückgängig gemacht werden.';
$string['snap_deleted']            = 'Snapshot „{$a}" gelöscht.';
$string['snap_delete_failed']      = 'Snapshot konnte nicht gelöscht werden: {$a}';
$string['snap_set_default_ok']     = 'Snapshot „{$a}" ist jetzt der Standard für neue Demos.';
$string['snap_set_default_failed'] = 'Standard-Snapshot konnte nicht gesetzt werden: {$a}';
$string['snap_download_failed']    = 'Snapshot konnte nicht heruntergeladen werden: {$a}';

// Fehler
$string['err_not_in_runbot']  = 'Diese Seite funktioniert nur innerhalb einer Runbot-verwalteten Demo-Instanz. Die Konfiguration $CFG->runbot_instance_id fehlt.';
$string['err_api_token']      = 'Runbot-API-Token fehlt oder ist ungültig in $CFG->runbot_api_token.';
$string['err_http']           = 'Backend-Request fehlgeschlagen: HTTP {$a->code} — {$a->body}';
$string['err_label_invalid']  = 'Die Bezeichnung darf nur Buchstaben, Ziffern und Bindestriche enthalten.';

// Privacy
$string['privacy:metadata']   = 'Das eLeDia Runbot Admin Plugin speichert keine personenbezogenen Daten. Es kommuniziert ausschließlich mit dem Runbot-MCP-Server zur Verwaltung von Snapshots und Plugin-Metadaten der aktuellen Demo-Instanz.';
