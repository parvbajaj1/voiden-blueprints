#!/usr/bin/env node
import { readFileSync } from 'fs'
const manifest = JSON.parse(readFileSync('./manifest.json', 'utf8'))
console.log(`Manifest ready: ${manifest.id} v${manifest.version}`)
