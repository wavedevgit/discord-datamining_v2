import path from 'node:path';

// Absolute in CI (a separate checkout of the data branch); relative for local
// runs, where the data branch is cloned into ./data next to this branch.
const DATA_DIR = process.env.DATA_DIR?.trim() || 'data';

function dataPath(relative: string): string {
    return path.join(DATA_DIR, relative);
}

export { DATA_DIR, dataPath };
