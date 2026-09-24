import ts from 'typescript'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative, resolve, sep } from 'node:path'

const root = process.cwd()
const sourceRoot = resolve(root, 'src')
const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css']

function filesUnder(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(file) : [file]
  })
}

const sourceFiles = filesUnder(sourceRoot).filter((file) => codeExtensions.includes(extname(file)))
const sourceSet = new Set(sourceFiles.map((file) => resolve(file)))
const visited = new Set()

function resolveImport(from, specifier) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null
  const base = specifier.startsWith('@/')
    ? resolve(sourceRoot, specifier.slice(2))
    : resolve(from, '..', specifier)
  for (const candidate of [
    base,
    ...codeExtensions.map((extension) => base + extension),
    ...codeExtensions.map((extension) => join(base, 'index' + extension)),
  ]) {
    if (sourceSet.has(candidate)) return candidate
  }
  return null
}

function visit(file) {
  const absolute = resolve(file)
  if (visited.has(absolute) || !existsSync(absolute)) return
  visited.add(absolute)
  const content = readFileSync(absolute, 'utf8')
  const source = ts.createSourceFile(
    absolute,
    content,
    ts.ScriptTarget.Latest,
    true,
    absolute.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
  const specifiers = []
  function walk(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text)
    }
    if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      specifiers.push(node.arguments[0].text)
    }
    ts.forEachChild(node, walk)
  }
  walk(source)
  for (const match of content.matchAll(/@import\s+['"]([^'"]+)['"]/g)) specifiers.push(match[1])
  for (const specifier of specifiers) {
    const target = resolveImport(absolute, specifier)
    if (target) visit(target)
  }
}

const entryNames = new Set([
  'page.tsx',
  'layout.tsx',
  'route.ts',
  'route.tsx',
  'loading.tsx',
  'error.tsx',
  'not-found.tsx',
  'template.tsx',
  'manifest.ts',
  'sitemap.ts',
  'robots.ts',
  'globals.css',
])
for (const file of sourceFiles) {
  const parts = relative(sourceRoot, file).split(sep)
  if (
    file === join(sourceRoot, 'proxy.ts') ||
    (parts[0] === 'app' && entryNames.has(parts.at(-1)))
  ) {
    visit(file)
  }
}
for (const file of filesUnder(resolve(root, 'e2e'))) {
  if (/\.spec\.tsx?$/.test(file)) visit(file)
}

console.log('Unreferenced source candidates:')
for (const file of sourceFiles.filter((file) => !visited.has(resolve(file)))) {
  console.log(file.slice(root.length + 1))
}
