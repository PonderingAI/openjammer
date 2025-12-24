#!/usr/bin/env bun
/**
 * Node Validation Tool
 *
 * Validates all node definitions for consistency and best practices.
 * Reports warnings (never blocks builds).
 *
 * Usage:
 *   bun run validate-nodes           # Validate all nodes
 *   bun run validate-nodes --fix     # Auto-fix simple issues (future)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Constants
const ROOT_DIR = join(import.meta.dir, '..');
const TYPES_FILE = join(ROOT_DIR, 'src/engine/types.ts');
const REGISTRY_FILE = join(ROOT_DIR, 'src/engine/registry.ts');
const NODES_DIR = join(ROOT_DIR, 'src/components/Nodes');
const NODE_WRAPPER_FILE = join(ROOT_DIR, 'src/components/Nodes/NodeWrapper.tsx');

// Validation patterns
const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const PASCAL_CASE_NODE = /^[A-Z][a-zA-Z0-9]*Node$/;

// Result types
interface ValidationResult {
    level: 'error' | 'warning' | 'info';
    nodeType: string;
    message: string;
    file?: string;
    line?: number;
}

// Extract node types from types.ts
function getRegisteredTypes(): string[] {
    const content = readFileSync(TYPES_FILE, 'utf-8');
    const match = content.match(/export type NodeType\s*=[\s\S]*?;/);
    if (!match) return [];

    const types: string[] = [];
    const typeRegex = /'\s*([^']+)\s*'/g;
    let m;
    while ((m = typeRegex.exec(match[0])) !== null) {
        types.push(m[1]);
    }
    return types;
}

// Extract node definitions from registry.ts
function getRegistryDefinitions(): Map<string, { category: string; ports: any[]; dimensions: any }> {
    const content = readFileSync(REGISTRY_FILE, 'utf-8');
    const definitions = new Map();

    // Simple regex to find node definitions
    const defRegex = /['"]?(\w+(?:-\w+)*)['"]?\s*:\s*\{[^}]*type:\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = defRegex.exec(content)) !== null) {
        const key = match[1];
        const type = match[2];

        // Extract category
        const categoryMatch = content.slice(match.index, match.index + 500).match(/category:\s*['"]([^'"]+)['"]/);
        const category = categoryMatch ? categoryMatch[1] : 'unknown';

        definitions.set(type, { category, ports: [], dimensions: null });
    }

    return definitions;
}

// Get component files in Nodes directory
function getComponentFiles(): string[] {
    const { readdirSync } = require('fs');
    try {
        return readdirSync(NODES_DIR)
            .filter((f: string) => f.endsWith('Node.tsx'))
            .map((f: string) => f.replace('.tsx', ''));
    } catch {
        return [];
    }
}

// Check NodeWrapper for routing cases (switch statement on node.type)
function getNodeWrapperCases(): string[] {
    const content = readFileSync(NODE_WRAPPER_FILE, 'utf-8');
    const cases: string[] = [];

    // Match both case 'type': and case "type": patterns
    const caseRegex = /case\s+['"]([^'"]+)['"]\s*:/g;
    let match;
    while ((match = caseRegex.exec(content)) !== null) {
        cases.push(match[1]);
    }

    return cases;
}

// Validation checks
function validateNaming(nodeType: string): ValidationResult[] {
    const results: ValidationResult[] = [];

    if (!KEBAB_CASE.test(nodeType)) {
        results.push({
            level: 'warning',
            nodeType,
            message: `Node type '${nodeType}' should be kebab-case`
        });
    }

    return results;
}

function validateRegistration(
    nodeType: string,
    registeredTypes: string[],
    registryDefs: Map<string, any>,
    components: string[],
    canvasCases: string[],
    options?: { isInstrumentSubtype?: boolean }
): ValidationResult[] {
    const results: ValidationResult[] = [];

    // Check if in NodeType union
    if (!registeredTypes.includes(nodeType)) {
        results.push({
            level: 'error',
            nodeType,
            message: `Not registered in NodeType union`,
            file: TYPES_FILE
        });
    }

    // Check if in registry (instrument subtypes share a component, so skip individual registry check)
    if (!registryDefs.has(nodeType) && !options?.isInstrumentSubtype) {
        results.push({
            level: 'error',
            nodeType,
            message: `No registry entry in nodeDefinitions`,
            file: REGISTRY_FILE
        });
    }

    // Check for component (convert kebab to PascalCase)
    // Instrument subtypes use InstrumentNode, so skip component check
    if (!options?.isInstrumentSubtype) {
        const expectedComponent = nodeType
            .split('-')
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join('') + 'Node';

        const hasComponent = components.some(c =>
            c.toLowerCase() === expectedComponent.toLowerCase()
        );

        if (!hasComponent) {
            results.push({
                level: 'warning',
                nodeType,
                message: `No component file found (expected ${expectedComponent}.tsx)`,
                file: join(NODES_DIR, expectedComponent + '.tsx')
            });
        }
    }

    // Check NodeWrapper routing (instrument subtypes are grouped in one case block)
    // They're handled by InstrumentNode via a fallthrough case
    if (!canvasCases.includes(nodeType) && !options?.isInstrumentSubtype) {
        results.push({
            level: 'error',
            nodeType,
            message: `No case in NodeWrapper switch statement`,
            file: NODE_WRAPPER_FILE
        });
    }

    return results;
}

function validatePorts(nodeType: string, content: string): ValidationResult[] {
    const results: ValidationResult[] = [];

    // Extract port definitions for this node type
    const nodeMatch = content.match(new RegExp(`['"]?${nodeType}['"]?\\s*:\\s*\\{[\\s\\S]*?defaultPorts:\\s*\\[[\\s\\S]*?\\]`, 'g'));
    if (!nodeMatch) return results;

    // Check port IDs
    const portIdRegex = /id:\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = portIdRegex.exec(nodeMatch[0])) !== null) {
        const portId = match[1];
        if (!KEBAB_CASE.test(portId) && !portId.startsWith('empty-') && !portId.startsWith('port-')) {
            results.push({
                level: 'warning',
                nodeType,
                message: `Port ID '${portId}' should be kebab-case`
            });
        }
    }

    // Check port positions
    const positionRegex = /position:\s*\{\s*x:\s*([\d.]+),\s*y:\s*([\d.]+)\s*\}/g;
    while ((match = positionRegex.exec(nodeMatch[0])) !== null) {
        const x = parseFloat(match[1]);
        const y = parseFloat(match[2]);

        if (x < 0 || x > 1 || y < 0 || y > 1) {
            results.push({
                level: 'warning',
                nodeType,
                message: `Port position (${x}, ${y}) should be normalized to 0-1 range`
            });
        }
    }

    return results;
}

function validateCategoryFields(nodeType: string, registryDefs: Map<string, any>): ValidationResult[] {
    const results: ValidationResult[] = [];
    const def = registryDefs.get(nodeType);
    if (!def) return results;

    // Category-specific recommendations
    const categoryRecommendations: Record<string, string[]> = {
        'input': ['isActive or isMuted field recommended for input nodes'],
        'instruments': ['offsets and activeInputs fields recommended for instrument nodes'],
        'effects': ['params field recommended for effect nodes'],
        'output': ['volume and isMuted fields recommended for output nodes']
    };

    const recommendations = categoryRecommendations[def.category];
    if (recommendations) {
        // This would require parsing defaultData, so we just add an info-level note
        results.push({
            level: 'info',
            nodeType,
            message: recommendations[0]
        });
    }

    return results;
}

// Main validation
function validate(): ValidationResult[] {
    console.log('\n🔍 OpenJammer Node Validator\n');

    const results: ValidationResult[] = [];

    // Gather data
    const registeredTypes = getRegisteredTypes();
    const registryDefs = getRegistryDefinitions();
    const components = getComponentFiles();
    const canvasCases = getNodeWrapperCases();
    const registryContent = readFileSync(REGISTRY_FILE, 'utf-8');

    console.log(`Found ${registeredTypes.length} registered types`);
    console.log(`Found ${registryDefs.size} registry definitions`);
    console.log(`Found ${components.length} component files`);
    console.log(`Found ${canvasCases.length} NodeWrapper cases\n`);

    // Get all unique node types
    const allTypes = new Set([
        ...registeredTypes,
        ...registryDefs.keys(),
        ...canvasCases
    ]);

    // Validate each type
    for (const nodeType of allTypes) {
        // Skip internal/special types that don't need all components
        const internalTypes = [
            'canvas-input', 'canvas-output', 'input-panel', 'output-panel',
            'control', 'universal',  // These are connection types, not node types
        ];
        if (internalTypes.includes(nodeType)) {
            continue;
        }
        // Skip visual and key subtypes (they use parent component)
        if (nodeType.endsWith('-visual') || nodeType.endsWith('-key')) {
            continue;
        }
        // Skip subtypes that use generic shared components
        const instrumentSubtypes = ['piano', 'cello', 'electricCello', 'violin', 'saxophone', 'strings', 'keys', 'winds', 'instrument'];
        const mathSubtypes = ['add', 'subtract'];  // Use MathNode component
        const isInstrumentSubtype = instrumentSubtypes.includes(nodeType);
        const isMathSubtype = mathSubtypes.includes(nodeType);
        const isSharedComponent = isInstrumentSubtype || isMathSubtype;

        results.push(...validateNaming(nodeType));
        results.push(...validateRegistration(nodeType, registeredTypes, registryDefs, components, canvasCases, { isInstrumentSubtype: isSharedComponent }));
        results.push(...validatePorts(nodeType, registryContent));
        // results.push(...validateCategoryFields(nodeType, registryDefs));  // Skip info-level for now
    }

    return results;
}

// Output formatting
function formatResults(results: ValidationResult[]): void {
    const errors = results.filter(r => r.level === 'error');
    const warnings = results.filter(r => r.level === 'warning');
    const infos = results.filter(r => r.level === 'info');

    if (errors.length > 0) {
        console.log('❌ Errors (must fix):\n');
        for (const error of errors) {
            console.log(`  [${error.nodeType}] ${error.message}`);
            if (error.file) console.log(`    → ${error.file}`);
        }
        console.log();
    }

    if (warnings.length > 0) {
        console.log('⚠️  Warnings (should fix):\n');
        for (const warning of warnings) {
            console.log(`  [${warning.nodeType}] ${warning.message}`);
            if (warning.file) console.log(`    → ${warning.file}`);
        }
        console.log();
    }

    if (infos.length > 0) {
        console.log('ℹ️  Info (nice to have):\n');
        for (const info of infos) {
            console.log(`  [${info.nodeType}] ${info.message}`);
        }
        console.log();
    }

    // Summary
    console.log('━'.repeat(50));
    console.log(`Total: ${errors.length} errors, ${warnings.length} warnings, ${infos.length} info`);

    if (errors.length === 0 && warnings.length === 0) {
        console.log('\n✅ All nodes validated successfully!\n');
    } else if (errors.length === 0) {
        console.log('\n🟡 Validation passed with warnings\n');
    } else {
        console.log('\n🔴 Validation failed - please fix errors\n');
    }
}

// Run
const results = validate();
formatResults(results);

// Exit with appropriate code (0 for success, errors are just warnings in our philosophy)
process.exit(0);
