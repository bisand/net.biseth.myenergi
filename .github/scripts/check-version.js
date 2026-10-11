// Checks that the app version is ready to publish: the same version in
// every file that carries it, and a changelog entry for it.
// With a tag as argument (e.g. v2.4.16) it also checks that the tag matches.
const fs = require('fs');

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const errors = [];

const version = read('.homeycompose/app.json').version;
const others = {
  'app.json': read('app.json').version,
  'package.json': read('package.json').version,
  'package-lock.json': read('package-lock.json').version,
};
for (const [file, other] of Object.entries(others)) {
  if (other !== version)
    errors.push(`${file} has version ${other}, but .homeycompose/app.json has ${version}.`);
}

const changelog = read('.homeychangelog.json')[version];
if (!changelog || !changelog.en)
  errors.push(`.homeychangelog.json has no "en" entry for version ${version}.`);

const tag = process.argv[2];
if (tag && tag !== `v${version}`)
  errors.push(`The release tag is ${tag}, but the app version is ${version}. The tag should be v${version}.`);

if (errors.length) {
  errors.forEach(error => console.error(`::error::${error}`));
  process.exit(1);
}
console.log(`Version ${version} is consistent${tag ? ` and matches tag ${tag}` : ''}.`);
if (process.env.GITHUB_OUTPUT)
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
