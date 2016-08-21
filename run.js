var start = new Date().getTime();

var argv = require('minimist')(process.argv.slice(2));
var runFile = argv._[1];
var interactive = !!argv.i;
var log = require('./log')(!!argv.v);
var io = require('./io')(log);
var authInstanceArr;

if (
    process.argv.length < 4 ||
    !(authInstanceArr = argv._[0].match(/([A-Za-z0-9+/=]+)@([a-zA-Z0-9\-]+)/)) ||
    !(runFile || argv.e || argv.suite || argv.i)
) {
    log.fatal(
        'Usage:\n' +
        '   node run.js base64auth@instance script.js\n' +
        'Example:\n' +
        '   node run.js YWRtaW46YWRtaW4=@demo001 demo.js\n' +
        '   (YWRtaW46YWRtaW4= is admin:admin encoded using Base64)\n' +
        'Optionally, supply a scope:\n' +
        '   node run.js YWRtaW46YWRtaW4=@demo001 --scope \'x_acme_testapp\' demo.js\n');
}

var authArr = (new Buffer(authInstanceArr[1], 'base64')).toString().split(/:(.+)?/);

var conf = {};
conf.user = authArr[0];
conf.pass = authArr[1];
conf.instance = authInstanceArr[2];
conf.host = conf.instance + '.service-now.com';
conf.baseUrl = 'https://' + conf.host + '/';
conf.scope = argv.scope || 'global';
conf.start = start;
var http = require('./http')(conf, log);

var cookiesFileName = '.org.snowlib.snow-runner.' + conf.instance + '.cookies';
var ckFileName = '.org.snowlib.snow-runner.' + conf.instance + '.ck';
var scopeFileName = '.org.snowlib.snow-runner.' + conf.instance + '.scope';

var i_script_arr = [];
var i_script;
var i_blankLineStreak = 0;
var i_fs = {};

if (interactive) {
    handleInteractive();
    return;
}
main();

function handleInteractive() {
    if (process.stdin.isTTY) {
        process.stdout.write('> ');
    }

    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onData);
}

function onData(chunk) {
    if (process.stdin.isTTY) {

        if (isBlankLine(chunk)) {
            i_blankLineStreak++;
        } else {
            i_script_arr.push(chunk);
            i_blankLineStreak = 0;
        }

        if (i_blankLineStreak < 1 || !i_script_arr.length) {
            process.stdout.write('> ');
            return;
        }

    } else {
        i_script_arr.push(chunk);
    }

    i_script = i_script_arr.join('\n');
    i_script_arr = [];
    i_blankLineStreak = 0;
    conf.start = new Date().getTime();
    mainInteractive();

    function isBlankLine(str) {
        return !!str.match(/^\s*$/);
    }
}

function mainInteractive() {

    var defaultActionFnInteractive = () => {
        getScriptInteractive((script) => {
            runScriptUsingNewSession(script);
        });
    };

    getFileDataInteractive(cookiesFileName, defaultActionFnInteractive, gotCookies);
    function gotCookies(cookiesData) {
        var cookieJar = http.getCookieJar();
        cookieJar.setCookie(cookiesData, conf.baseUrl);
        getFileDataInteractive(ckFileName, defaultActionFnInteractive, gotCk);
        function gotCk(ckData) {
            getFileDataInteractive(scopeFileName, defaultActionFnInteractive, gotScope);
            function gotScope(scopeData) {
                if (scopeData == 'undefined') scopeData = undefined;
                getScriptInteractive((script) => {
                    runScriptUsingExistingSession(script, ckData, scopeData);
                });
            }
        }
    }
}

function getFileDataInteractive(filePath, onNotFound, onComplete) {
    var fileData = i_fs[filePath];
    if (!fileData) onNotFound();
    else onComplete(fileData);
}

function getScriptInteractive(onComplete) {
    onComplete(i_script);
}

function main() {
    var saveCk, saveScope;
    var defaultActionFn = () => {
        getScript((script) => {
            runScriptUsingNewSession(script);
        });
    };

    io.getFileData(cookiesFileName, defaultActionFn, gotCookies);
    function gotCookies(cookiesData) {
        var cookieJar = http.getCookieJar();
        cookieJar.setCookie(cookiesData, conf.baseUrl);
        io.getFileData(ckFileName, defaultActionFn, gotCk);
    }
    function gotCk(ckData) {
        saveCk = ckData;
        io.getFileData(scopeFileName, defaultActionFn, gotScope);
    }
    function gotScope(scopeData) {
        if (scopeData == 'undefined') scopeData = undefined;
        saveScope = scopeData;
        getScript(gotScript);
    }
    function gotScript(script) {
        runScriptUsingExistingSession(script, saveCk, saveScope);
    }
}

function getScript(onComplete) {
    if (argv.suite) {
        onComplete(
            'gs.include("SnowLib.Tester.Suite");' +
            'SnowLib.Tester.Suite.getByName("' + argv.suite + '").run();'
        );

    } else if (argv.e) {
        onComplete(argv.e);

    } else {
        io.getFileData(runFile,
            () => {
                log.fatal('File not found: ' + runFile);
            },
            onComplete
        );
    }
}

function runScriptUsingExistingSession(script, ck, sysScope) {
    http.submit(ck, script, sysScope, submitFailed, submitSucceeded);
    function submitFailed() {
        runScriptUsingNewSession(script);
    }
    function submitSucceeded() {}
}

function runScriptUsingNewSession(script) {
    if (!script) log.fatal('Script is empty.');
    var saveCk, saveSysScope;

    http.login(loggedIn);
    function loggedIn() {
        http.elevate(elevated);
    }
    function elevated(ck) {
        http.getPage(unrecognizedPage, gotPage);
    }
    function unrecognizedPage() {
        log.fatal('\nError: Did not recognize sys.scripts.do in new session.');
    }
    function gotPage(ck, sysScope) {
        saveCk = ck;
        saveSysScope = sysScope;
        http.submit(ck, script, sysScope, submitFailed, submitSucceeded);
    }
    function submitFailed() {
        log.fatal('\nError: Could not submit script due to security restriction.');
    }
    function submitSucceeded() {
        var cookieString = http.getCookieJar().getCookieString(conf.baseUrl);
        if (interactive) {
            i_fs[cookiesFileName] = cookieString;
            i_fs[ckFileName] = saveCk;
            i_fs[scopeFileName] = saveSysScope;
        } else {
            io.saveFile(cookiesFileName, cookieString);
            io.saveFile(ckFileName, saveCk);
            io.saveFile(scopeFileName, saveSysScope);
        }
    }
}
