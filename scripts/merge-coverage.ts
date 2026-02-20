import { resolve, relative, dirname } from "node:path";
import { Glob } from "bun";

const root = process.cwd();
const glob = new Glob("{packages,modules}/*/coverage/lcov.info");
let merged = "";

for (const lcovPath of glob.scanSync(".")) {
	const packageDir = resolve(dirname(dirname(lcovPath)));
	const content = await Bun.file(lcovPath).text();

	const records = content.split("end_of_record\n");
	for (const record of records) {
		if (!record.trim()) continue;

		const sfMatch = record.match(/^SF:(.+)$/m);
		if (!sfMatch) continue;

		const resolved = relative(root, resolve(packageDir, sfMatch[1]));
		if (/\btest\b/.test(resolved)) continue;

		merged += record.replace(/^SF:(.+)$/m, `SF:${resolved}`) + "end_of_record\n";
	}
}

await Bun.write("coverage/lcov.info", merged);
