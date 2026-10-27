import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
const root = 'miniprogram', app = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));
const native = new Set('view text image input textarea picker button scroll-view swiper swiper-item block switch form label radio radio-group checkbox checkbox-group progress navigator rich-text icon cover-view cover-image'.split(' '));
let failures = 0;
function fail(message) { console.error(message); failures++; }
function walk(directory) { for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory())
        walk(path);
    else if (path.endsWith('.js')) {
        try {
            new vm.Script(readFileSync(path, 'utf8'), { filename: path });
        }
        catch (error) {
            fail(error.message);
        }
    }
    else if (path.endsWith('.json')) {
        try {
            JSON.parse(readFileSync(path, 'utf8'));
        }
        catch (error) {
            fail(error.message);
        }
    }
} }
walk(root);
for (const page of app.pages) {
    for (const extension of ['.js', '.json', '.wxml', '.wxss'])
        if (!existsSync(join(root, page + extension)))
            fail('缺少页面文件：' + page + extension);
    if (!existsSync(join(root, page + '.wxml')))
        continue;
    const source = readFileSync(join(root, page + '.wxml'), 'utf8');
    const stack = [];
    for (const tag of source.matchAll(/<\s*(\/?)\s*([\w:-]+)\b([^>]*?)(\/?)>/g)) {
        const [, closing, name, , selfClosing] = tag;
        if (!native.has(name))
            fail(page + '：不支持的原生组件 ' + name);
        if (closing) {
            if (stack.pop() !== name)
                fail(page + '：标签未配对 ' + name);
        }
        else if (!selfClosing)
            stack.push(name);
    }
    if (stack.length)
        fail(page + '：标签未闭合 ' + stack.join(','));
    let definition;
    const sandbox = { Page: obj => { definition = obj; }, require: () => ({}), wx: {}, console };
    try {
        vm.runInNewContext(readFileSync(join(root, page + '.js'), 'utf8'), sandbox);
    }
    catch (error) {
        fail(page + '：页面初始化失败 ' + error.message);
    }
    for (const event of source.matchAll(/(?:bind|catch)[a-zA-Z:]+="([a-zA-Z_]\w*)"/g))
        if (typeof definition?.[event[1]] !== 'function')
            fail(page + '：事件处理函数不存在 ' + event[1]);
}
for (const tab of app.tabBar.list)
    if (!app.pages.includes(tab.pagePath))
        fail('Tab未注册：' + tab.pagePath);
if (failures)
    process.exitCode = 1;
else
    console.log(`原生小程序静态检查通过：${app.pages.length}个页面，JS/JSON/组件标签/事件绑定完整。`);
