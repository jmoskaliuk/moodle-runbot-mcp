<?php
// HTTP client that talks to the Runbot MCP backend's /api/internal/* endpoints.
//
// Design notes
// ────────────
// - All calls go to $CFG->runbot_api_url (e.g. https://demo.eledia.ai).
// - Authentication: two custom headers
//     X-Runbot-Instance-Id: $CFG->runbot_instance_id
//     X-Runbot-Api-Token:   $CFG->runbot_api_token
//   The backend matches the token against its own registry; mismatched
//   tokens get a 401 and are logged.
// - Errors are normalized to a Throwable with a human message so the UI
//   layer can catch + display without parsing JSON.
// - We use curl directly (not Moodle's curl class) to keep the plugin
//   dependency-light and avoid Moodle's magic-header injection.

namespace local_runbotadmin;

defined('MOODLE_INTERNAL') || die();

class api_client {

    /** @var string */
    private $baseurl;
    /** @var string */
    private $instanceid;
    /** @var string */
    private $token;

    public function __construct() {
        global $CFG;
        $this->baseurl    = rtrim($CFG->runbot_api_url ?? '', '/');
        $this->instanceid = $CFG->runbot_instance_id ?? '';
        $this->token      = $CFG->runbot_api_token   ?? '';

        if ($this->instanceid === '') {
            throw new \moodle_exception('err_not_in_runbot', 'local_runbotadmin');
        }
        if ($this->token === '' || $this->baseurl === '') {
            throw new \moodle_exception('err_api_token', 'local_runbotadmin');
        }
    }

    /**
     * POST /api/internal/snapshot/create
     *
     * @param string $label
     * @param string $description
     * @return array Response object with fields: snapshotId, label, sizeBytes, createdAt
     * @throws \moodle_exception on transport or backend error
     */
    public function create_snapshot(string $label, string $description): array {
        return $this->request('POST', '/api/internal/snapshot/create', [
            'label'       => $label,
            'description' => $description,
        ]);
    }

    /**
     * GET /api/internal/snapshot/list
     * Lists all snapshots that belong to this instance's plugin slug.
     *
     * @return array List of snapshot meta objects
     */
    public function list_snapshots(): array {
        $res = $this->request('GET', '/api/internal/snapshot/list', null);
        return $res['snapshots'] ?? [];
    }

    /**
     * Internal HTTP helper. Uses curl, 30s default timeout.
     *
     * @param string $method 'GET' or 'POST'
     * @param string $path e.g. '/api/internal/snapshot/create'
     * @param array|null $body
     * @return array Parsed JSON response
     * @throws \moodle_exception
     */
    private function request(string $method, string $path, ?array $body): array {
        $url = $this->baseurl . $path;

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
        curl_setopt($ch, CURLOPT_TIMEOUT, 120); // pg_dump can take a while

        $headers = [
            'Content-Type: application/json',
            'Accept: application/json',
            'X-Runbot-Instance-Id: ' . $this->instanceid,
            'X-Runbot-Api-Token: '   . $this->token,
        ];
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body ?? (object)[]));
        }

        $responsebody = curl_exec($ch);
        $code         = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlerr      = curl_error($ch);
        curl_close($ch);

        if ($responsebody === false) {
            throw new \moodle_exception(
                'err_http',
                'local_runbotadmin',
                '',
                (object)['code' => 0, 'body' => 'curl error: ' . $curlerr]
            );
        }
        if ($code < 200 || $code >= 300) {
            throw new \moodle_exception(
                'err_http',
                'local_runbotadmin',
                '',
                (object)['code' => $code, 'body' => substr((string)$responsebody, 0, 300)]
            );
        }

        $decoded = json_decode((string)$responsebody, true);
        if (!is_array($decoded)) {
            throw new \moodle_exception(
                'err_http',
                'local_runbotadmin',
                '',
                (object)['code' => $code, 'body' => 'invalid json: ' . substr((string)$responsebody, 0, 200)]
            );
        }
        return $decoded;
    }
}
