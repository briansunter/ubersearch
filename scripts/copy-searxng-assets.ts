import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const ASSET_FILES = [
  ["providers/searxng/docker-compose.yml", "providers/searxng/docker-compose.yml"],
  ["providers/searxng/config/settings.yml", "providers/searxng/config/settings.yml"],
] as const;

export async function copySearxngAssets(
  distDir: string = join(process.cwd(), "dist"),
): Promise<void> {
  const resolvedDistDir = resolve(distDir);

  for (const [sourceRelativePath, targetRelativePath] of ASSET_FILES) {
    const sourcePath = resolve(process.cwd(), sourceRelativePath);
    const targetPath = join(resolvedDistDir, targetRelativePath);

    if (!(await Bun.file(sourcePath).exists())) {
      continue;
    }

    await mkdir(dirname(targetPath), { recursive: true });
    await Bun.write(targetPath, Bun.file(sourcePath));
  }
}

if (import.meta.main) {
  await copySearxngAssets();
}
