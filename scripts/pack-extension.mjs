#!/usr/bin/env bun
/**
 * Pack extensions/arabclue-agent → public/downloads/arabclue-agent.zip
 * Run: bun run pack:extension
 */
import { packExtensionZipToPublic } from "../src/lib/extension-pack.ts";

const out = await packExtensionZipToPublic();
console.log(`Packed extension → ${out}`);
