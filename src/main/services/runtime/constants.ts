export const DEFAULT_NODE_VERSION = '22.11.0';
export const DEFAULT_PYTHON_VERSION = '3.13.0';

export const RUNTIME_DIR_NAME = 'runtimes';
export const LEVANTE_DIR_NAME = 'levante';

export const NODE_DIST_BASE_URL = 'https://nodejs.org/dist';

// Python Standalone Builds (Indygreg)
// https://github.com/indygreg/python-build-standalone/releases
export const PYTHON_STANDALONE_TAG = '20241016';
export const PYTHON_STANDALONE_VERSION = '3.13.0';

// PortableGit (https://github.com/git-for-windows/git/releases)
// Used on Windows to guarantee a POSIX shell (bash.exe) for Cowork tools
// when the user doesn't have Git Bash or PowerShell available.
export const PORTABLE_GIT_VERSION = '2.47.0.2';
export const PORTABLE_GIT_TAG = 'v2.47.0.windows.2';
export const PORTABLE_GIT_ARCHIVE_X64 = 'PortableGit-2.47.0.2-64-bit.7z.exe';
export const PORTABLE_GIT_URL_X64 =
    'https://github.com/git-for-windows/git/releases/download/' +
    PORTABLE_GIT_TAG + '/' + PORTABLE_GIT_ARCHIVE_X64;
