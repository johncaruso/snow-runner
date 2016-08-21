// TODO fix --scope not working if files cached

var start = new Date().getTime();
var conf = require('./config')().getConfig();
conf.start = start;
var log = require('./log')(conf.verbose);
var io = require('./io')(log);
var http = require('./http')(conf, log);

var i_script_arr = [];
var i_script;
var i_blankLineStreak = 0;
var i_fs = {};

if (conf.interactive) {
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
    var saveCk, saveScope;

    var defaultActionFnInteractive = () => {
        getScriptInteractive((script) => {
            runScriptUsingNewSession(script);
        });
    };

    getFileDataInteractive(conf.cookiesFileName, defaultActionFnInteractive, gotCookies);

    function gotCookies(cookiesData) {
        var cookieJar = http.getCookieJar();
        cookieJar.setCookie(cookiesData, conf.baseUrl);
        getFileDataInteractive(conf.ckFileName, defaultActionFnInteractive, gotCk);
    }

    function gotCk(ckData) {
        saveCk = ckData;
        getFileDataInteractive(conf.scopeFileName, defaultActionFnInteractive, gotScope);
    }

    function gotScope(scopeData) {
        if (scopeData == 'undefined') scopeData = undefined;
        saveScope = scopeData;
        getScriptInteractive(gotScript);
    }

    function gotScript(script) {
        runScriptUsingExistingSession(script, saveCk, saveScope);
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

    io.getFileData(conf.cookiesFileName, defaultActionFn, gotCookies);
    function gotCookies(cookiesData) {
        var cookieJar = http.getCookieJar();
        cookieJar.setCookie(cookiesData, conf.baseUrl);
        io.getFileData(conf.ckFileName, defaultActionFn, gotCk);
    }

    function gotCk(ckData) {
        saveCk = ckData;
        io.getFileData(conf.scopeFileName, defaultActionFn, gotScope);
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
    if (conf.suite) conf.expression = getSnowTesterScript(conf.suite);
    if (conf.expression) return onComplete(conf.expression);
    io.getFileData(conf.scriptFile, scriptFileNotFound, onComplete);

    function scriptFileNotFound() {
        log.fatal('File not found: ' + conf.scriptFile);
    }
}

function getSnowTesterScript(suite) {
    return `
gs.include('SnowLib.Tester.Suite');
SnowLib.Tester.Suite.getByName('${suite}').run();`;
}


function runScriptUsingExistingSession(script, ck, sysScope) {
    http.submit(ck, script, sysScope, submitFailed, submitSucceeded);
    function submitFailed() {
        runScriptUsingNewSession(script);
    }

    function submitSucceeded() {
    }
}

function runScriptUsingNewSession(script) {
    if (!script) log.fatal('Script is empty.');
    var saveCk, saveSysScope;

    http.login(loggedIn);
    function loggedIn() {
        // TODO make elevation configurable as it's not needed in Helsinki
        // http.elevate(elevated);
        http.getPage(unrecognizedPage, gotPage);
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
        if (conf.interactive) {
            i_fs[conf.cookiesFileName] = cookieString;
            i_fs[conf.ckFileName] = saveCk;
            i_fs[conf.scopeFileName] = saveSysScope;
        } else {
            io.saveFile(conf.cookiesFileName, cookieString);
            io.saveFile(conf.ckFileName, saveCk);
            io.saveFile(conf.scopeFileName, saveSysScope);
        }
    }
}
