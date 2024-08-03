const $ = require('gee-shell');
const axios = require('axios');
const path = require('path');
const { parse } = require('url');
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

async function scrapeWebsite(websiteUrl, baseDir) {
  // Ensure the base directory exists
  $.mkdir('-p', baseDir);
  
  // Use wget to mirror the website
  const command = `wget --mirror --convert-links --directory-prefix=${baseDir} ${websiteUrl}`;
  const result = $.exec(command);
  
  if (result.code !== 0) {
    throw new Error(`wget failed with code ${result.code}: ${result.stderr}`);
  }
  
  // List all files in the directory
  const files = $.ls(`${baseDir}/**/*`);
  for (const file of files) {
    const content = $.cat(file).toString();
    const relativePath = path.relative(baseDir, file);
    await uploadToGitHub(`core/mirror/${relativePath}`, content, `Add file ${relativePath}`);
  }
}

exports.handler = async (event, context) => {
  try {
    const { websiteUrl } = event.queryStringParameters;
    if (!websiteUrl) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing websiteUrl parameter' }),
      };
    }

    const websiteName = parse(websiteUrl).hostname.replace(/[^a-z0-9 .]/gi, '_').toLowerCase();
    const baseDir = `core/mirror/${websiteName}`;

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
