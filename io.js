var fs = require('fs');

function io(log) {

    function getFileData(filePath, onNotFound, onComplete) {
        fs.readFile(filePath, (err, data) => {
            if (err) {
                if (err.code !== 'ENOENT') log.fatal(err);
                onNotFound();
            } else {
                var fileData = data.toString();
                onComplete(fileData);
            }
        });
    }

    function saveFile(filePath, fileData) {
        fs.writeFile(filePath, fileData, (err) => {
            if (err) log.fatal(err);
        });
    }

    return {
        getFileData,
        saveFile
    }
}

module.exports = io;