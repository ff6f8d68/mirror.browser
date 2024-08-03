var { exec } = require('child_process');
var path = require('path');
var AdmZip = require('adm-zip');
var fs = require('fs');
var { parse } = require('url');

// Function to create a ZIP file from the directory
async function createZip(baseDir, outputFilePath) {
  var zip = new AdmZip();
  zip.addLocalFolder(baseDir);
  zip.writeZip(outputFilePath);
}

async function runBashScript(websiteUrl, baseDir) {
  return new Promise((resolve, reject) => {
    var scriptPath = path.join(__dirname, 'scrape.sh');
    var command = `bash ${scriptPath} ${websiteUrl} ${baseDir}`;
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`Bash script failed: ${stderr}`));
      }
      resolve(stdout);
    });
  });
}

async function scrapeWebsite(websiteUrl, baseDir) {
  // Ensure the base directory exists
  await runBashScript(websiteUrl, baseDir);
}

exports.handler = async function(event, context) {
  try {
    var { websiteUrl } = event.queryStringParameters;
    if (!websiteUrl) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing websiteUrl parameter' }),
      };
    }

    var websiteName = parse(websiteUrl).hostname.replace(/[^a-z0-9 .]/gi, '_').toLowerCase();
    var baseDir = path.join(__dirname, 'core', 'mirror', websiteName);
    var outputFilePath = path.join(__dirname, 'core', 'mirror', `${websiteName}.zip`);

    // Clear the base directory
    fs.rmdirSync(baseDir, { recursive: true });

    await scrapeWebsite(websiteUrl, baseDir);
    await createZip(baseDir, outputFilePath);

    var zipContent = fs.readFileSync(outputFilePath);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename=${websiteName}.zip`
      },
      body: zipContent.toString('base64'),
      isBase64Encoded: true
    };
  } catch (error) {
    console.error('Error in function:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
