var { exec } = require('child_process');
var path = require('path');
var axios = require('axios');
var { parse } = require('url');
var { Buffer } = require('buffer');

// GitHub repository information
var GITHUB_TOKEN = process.env.GITHUB_TOKEN;
var REPO_OWNER = 'ff6f8d68';
var REPO_NAME = 'mirror.browser';
var BRANCH = 'main';

// Create GitHub API client
var githubApi = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    Authorization: `token ${GITHUB_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

async function uploadToGitHub(pathInRepo, content, message) {
  var { data: { sha } } = await githubApi.get(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${pathInRepo}?ref=${BRANCH}`).catch(() => ({ data: {} }));
  
  await githubApi.put(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${pathInRepo}`, {
    message,
    content: Buffer.from(content).toString('base64'),
    sha,
    branch: BRANCH
  });
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
  
  // List all files in the directory
  var files = require('glob').sync(`${baseDir}/**/*`);
  for (var file of files) {
    var content = require('fs').readFileSync(file).toString();
    var relativePath = path.relative(baseDir, file);
    await uploadToGitHub(`core/mirror/${relativePath}`, content, `Add file ${relativePath}`);
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
    var baseDir = `core/mirror/${websiteName}`;

    await scrapeWebsite(websiteUrl, baseDir);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Website saved successfully' }),
    };
  } catch (error) {
    console.error('Error in function:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
