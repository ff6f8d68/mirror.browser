const shell = require('shelljs');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { Buffer } = require('buffer');

// GitHub repository information
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = 'ff6f8d68';
const REPO_NAME = 'mirror.browser';
const BRANCH = 'main';

// Create GitHub API client
const githubApi = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    Authorization: `token ${GITHUB_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

async function uploadToGitHub(pathInRepo, content, message) {
  const { data: { sha } } = await githubApi.get(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${pathInRepo}?ref=${BRANCH}`).catch(() => ({ data: {} }));
  
  await githubApi.put(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${pathInRepo}`, {
    message,
    content: Buffer.from(content).toString('base64'),
    sha,
    branch: BRANCH
  });
}

async function uploadDirectoryToGitHub(localDir, repoDir) {
  const files = shell.find(localDir).filter(file => fs.statSync(file).isFile());
  for (const file of files) {
    const relativePath = path.relative(localDir, file);
    const repoPath = path.join(repoDir, relativePath);
    const fileContent = fs.readFileSync(file);
    await uploadToGitHub(repoPath, fileContent, `Add ${relativePath}`);
  }
}

exports.handler = async (event, context) => {
  try {
    const url = event.queryStringParameters?.url;
    if (!url) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing url parameter' }),
      };
    }

    const websiteUrl = decodeURIComponent(url);
    const websiteName = new URL(websiteUrl).hostname.replace(/[^a-z0-9 .]/gi, '_').toLowerCase();
    const outputDir = path.join(__dirname, 'core', 'mirror', websiteName);

    // Run wget to download the website
    const wgetCommand = `wget --mirror --convert-links --adjust-extension --page-requisites --no-parent --directory-prefix=${outputDir} ${websiteUrl}`;
    const wgetResult = shell.exec(wgetCommand, { silent: false });

    if (wgetResult.code !== 0) {
      throw new Error(`wget failed with code ${wgetResult.code}. Output: ${wgetResult.stderr}`);
    }

    // Upload the downloaded site to GitHub
    await uploadDirectoryToGitHub(outputDir, `core/mirror/${websiteName}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Website saved and uploaded to GitHub successfully' }),
    };
  } catch (error) {
    console.error('Error in function:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
