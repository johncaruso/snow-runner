function logger(verbose) {

    function fatal(msg, exitCode) {
        console.log(msg);
        process.exit(exitCode === undefined ? 1 : exitCode);
    }

    function infoLn(msg) {
        info(msg + '\n');
    }

    function info(msg) {
        if (verbose) {
            process.stdout.write(msg);
        }
    }

    return {
        fatal,
        infoLn,
        info
    }
}

module.exports = logger;