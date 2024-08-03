var $ = require('gee-shell');
var path = require('path');
var { parse } = require('url');
var AdmZip = require('adm-zip');
var fs = require('fs');

// Function to create a ZIP file from the directory
async function createZip(baseDir, outputFilePath) {
  var zip = new AdmZip();
  zip.addLocalFolder(baseDir);
  zip.writeZip(outputFilePath);
}

async function scrapeWebsite(websiteUrl, baseDir) {
  // Ensure the base directory exists
  $.mkdir('-p', baseDir);

  // Use wget to mirror the website
  var command = `wget --mirror --convert-links --directory-prefix=${baseDir} ${websiteUrl}`;
  var result = $.run(command);
  
  if (result.code !== 0) {
    throw new Error(`wget failed with code ${result.code}: ${result.stderr}`);
  }
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
    $.rm('-rf', baseDir);

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
