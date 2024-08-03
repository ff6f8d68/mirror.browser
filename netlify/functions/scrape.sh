#!/bin/bash

# $1 is the first argument passed to the script (website URL)
# $2 is the second argument (base directory)

WEBSITE_URL=$1
BASE_DIR=$2

# Ensure the base directory exists
mkdir -p "$BASE_DIR"

# Run wget with mirror and convert-links options
wget --mirror --convert-links --directory-prefix="$BASE_DIR" "$WEBSITE_URL"
