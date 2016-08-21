// TODO npm install --save meow

function config() {
    var argv = require('minimist')(process.argv.slice(2));
    var log = require('./log')();

    return {
        getConfig
    };

    function getConfig() {
        var conf = {};

        validate(conf);

        conf.verbose = !!argv.v;
        conf.interactive = !!argv.i;
        conf.expression = argv.e;
        conf.suite = argv.suite;
        conf.scope = argv.scope || 'global';
        conf.host = conf.instance + '.service-now.com';
        conf.baseUrl = 'https://' + conf.host + '/';
        conf.cookiesFileName = '.org.snowlib.snow-runner.' + conf.instance + '.cookies';
        conf.ckFileName = '.org.snowlib.snow-runner.' + conf.instance + '.ck';
        conf.scopeFileName = '.org.snowlib.snow-runner.' + conf.instance + '.scope';

        return conf;
    }

    function validate(conf) {
        if (process.argv.length < 4)
            return usage();

        var auth = argv._[0].toString();
        var authInstanceArr = auth.match(/([A-Za-z0-9+/=]+)@([a-zA-Z0-9\-]+)/);
        if (!authInstanceArr)
            return usage();

        var authArr = (new Buffer(authInstanceArr[1], 'base64')).toString().split(/:(.+)?/);
        conf.user = authArr[0];
        conf.pass = authArr[1];
        conf.instance = authInstanceArr[2];

        if (argv.e || argv.suite || argv.i)
            return;

        if (!argv._[1])
            return usage();

        conf.scriptFile = argv._[1].toString();
    }


    function usage() {
        log.fatal(`
Usage:
  node run.js base64auth@instance script.js 
  
Options:
  -i        interactive mode
  -e        script expression mode
  -v        verbose logging
  --scope   application scope

Example:
  node run.js YWRtaW46YWRtaW4=@demo001 demo.js
  (YWRtaW46YWRtaW4= is admin:admin encoded using Base64)

Optionally, supply a scope:
   node run.js YWRtaW46YWRtaW4=@demo001 --scope 'x_acme_testapp' demo.js
`);
    }
}

module.exports = config;
