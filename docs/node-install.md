---
title: Installing Node.js
description: How to install Node.js and npm for Mason
---

# Installing Node.js

Mason requires **Node.js 22** or later and **npm 9** or later. We recommend using a version manager like **nvm** so you can easily switch between Node.js versions across projects.

## Recommended: Install with nvm

[nvm](https://github.com/nvm-sh/nvm) (Node Version Manager) lets you install and manage multiple Node.js versions.

### macOS / Linux

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Restart your terminal, then install Node.js 22
nvm install 22
nvm use 22

# Verify
node --version   # should print v22.x.x
npm --version    # should print 9.x or later
```

### Windows

Use [nvm-windows](https://github.com/coreybutler/nvm-windows):

1. Download the latest installer from the [releases page](https://github.com/coreybutler/nvm-windows/releases)
2. Run the installer
3. Open a new terminal and run:

```bash
nvm install 22
nvm use 22
```

## Alternative: Direct Install

If you prefer not to use a version manager, download Node.js directly from the [official website](https://nodejs.org/).

1. Go to [nodejs.org](https://nodejs.org/)
2. Download the **LTS** version (22.x or later)
3. Run the installer for your platform
4. Verify the installation:

```bash
node --version
npm --version
```

## Verify Your Setup

Once Node.js is installed, confirm everything is ready for Mason:

```bash
node --version   # v22.0.0 or later
npm --version    # 9.0.0 or later
```

Then install Mason:

```bash
npm install -g @clawmasons/mason
```

## Next Steps

- [Getting Started](get-started.md) — Install Mason and run your first role
- [Development](development.md) — Contributing to the Mason codebase
