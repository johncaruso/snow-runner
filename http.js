var request = require('request');
var HttpsAgent = require('agentkeepalive').HttpsAgent;
var htmlToText = require('html-to-text');

function http(conf, log) {
    var agent = new HttpsAgent({keepAlive: true, keepAliveTimeout: 300000});
    var cookieJar = request.jar();
    var r = request.defaults({jar: cookieJar, followAllRedirects: true, agent: agent});

    function login(onComplete) {
        log.info('Logging in to ' + conf.host + ' as ' + conf.user + '... ');
        var formParms = {
            user_name: conf.user,
            user_password: conf.pass,
            sys_action: 'sysverb_login',
            sysparm_login_url: 'welcome.do'
        };
        r.post(
            conf.baseUrl + 'login.do',
            {form: formParms},
            function (error, response, body) {
                // log.infoLn('STATUS: ' + response.statusCode);
                // log.infoLn('HEADERS: ' + JSON.stringify(response.headers));
                body = body || '';
                var m;
                if (/User name or password invalid/.test(body)) {
                    log.fatal('\nError: User name or password invalid.');

                } else if (!(m = body.match(/userObject.setElevatedRoles\('(.*)'\);/))) {
                    log.fatal('\nError: Unrecognized page returned after login.\n' + body);

                } else if (m[1].split(',').indexOf('security_admin') === -1) {
                    log.fatal('\nError: Insufficient privileges. Must have security_admin to run code.');

                } else {
                    log.infoLn('Success.');
                    onComplete();

                }
            }
        );
    }

    function elevate(onComplete) {
        log.info('Elevating... ');
        var formParms = {
            elevated_roles: 'security_admin',
            elevated_role: 'security_admin',
            sys_action: 'none'
        };
        r.post(
            conf.baseUrl + 'ui_page_process.do?sys_id=b80fa99a0a0a0b7f2c2a0da76c12ae00',
            {form: formParms},
            function (error, response, body) {
                body = body || '';
                var m;
                var ckm;
                if (!(m = body.match(/userObject.setActiveElevatedRoles\('(.*)'\);/)) ||
                    !( ckm = body.match(/var g_ck = '([a-f0-9]+)';/))) {
                    log.fatal('\nError: Unrecognized page returned after elevating.\n' + body);

                } else if (m[1].split(',').indexOf('security_admin') === -1) {
                    log.fatal('\nError: Elevation did not succeed.');

                } else {
                    log.infoLn('Success.');
                    onComplete(ckm[1]);

                }
            }
        );
    }


    function getPage(onUnrecognized, onComplete) {
        log.info('Loading sys.scripts.do form... ');
        r.get(
            conf.baseUrl + 'sys.scripts.do',
            function (error, response, body) {
                body = body || '';
                var ckm;
                if (!(ckm = body.match(/name="sysparm_ck" type="hidden" value="([a-f0-9]+)"/))) {
                    log.infoLn('Unrecognized / Redirect.');
                    onUnrecognized();
                } else {
                    var sysScope = getScopeOptionValue(body);
                    log.infoLn('Success.');
                    onComplete(ckm[1], sysScope);
                }
            }
        );

        function getScopeOptionValue(body) {
            var regex = new RegExp("<option value=\"([a-f0-9]+)\">" + conf.scope + "</option>");
            var match = body.match(regex);
            if (match) return match[1];

            // In Fuji the option value for global is a sys_id, in Helsinki (and Geneva?) it is 'global'
            // so the regex above fails to match.
            // If we wanted global scope, return 'global'
            if (conf.scope === 'global') return 'global';

            // Otherwise, the scope option value was not found, so fail
            log.fatal('\nError: Scope \'' + conf.scope + '\' not recognized in sys.scripts.do form.\n');
        }
    }



    function submit(ck, script, sysScope, onForbiddenOrUnrecognized, onComplete) {
        var formParms = {
            sysparm_ck: ck,
            script: script,
            runscript: 'Run script',
            sys_scope: sysScope
        };
        r.post(
            conf.baseUrl + 'sys.scripts.do',
            {form: formParms},
            function (error, response, body) {
                if (response.statusCode == 403 || !body.match(/^\[[\d\.]+\]*/)) {
                    onForbiddenOrUnrecognized();
                }
                else {
                    process.stdout.write(htmlToText.fromString(
                            body.replace(/<HR\/>/i, '<BR/><HR/>').replace(/\n/g, '<BR/>'),
                            {wordwrap: process.stdout.columns}
                        ) + '\n\n');

                    if (process.stdin.isTTY) {
                        process.stdout.write('> ');
                    }

                    log.infoLn((new Date().getTime() - conf.start) + ' ms');
                    onComplete();
                }
            }
        );
    }

    function getCookieJar() {
        return cookieJar;
    }


    return {
        login,
        elevate,
        getPage,
        submit,
        getCookieJar
    }
}

module.exports = http;