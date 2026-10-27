import ts from 'typescript';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
function walk(directory) { for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory())
        walk(path);
    else if (/\.(ts|js|mjs)$/.test(path)) {
        const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, path.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS);
        writeFileSync(path, printer.printFile(source));
    }
} }
for (const directory of ['server', 'miniprogram', 'scripts'])
    walk(directory);
console.log('已使用现有 TypeScript 工具统一代码格式。');
