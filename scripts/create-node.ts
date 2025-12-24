#!/usr/bin/env bun
/**
 * Node Scaffolding CLI Tool
 *
 * Creates all the boilerplate files needed for a new node:
 * - Type definition in types.ts
 * - Registry entry in registry.ts
 * - Component file in src/components/Nodes/
 * - CSS file (optional)
 * - NodeWrapper routing case
 *
 * Usage:
 *   bun run create-node                           # Interactive mode
 *   bun run create-node --name "reverb" --category "effects" --type "atomic"
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

// Constants
const ROOT_DIR = join(import.meta.dir, '..');
const TYPES_FILE = join(ROOT_DIR, 'src/engine/types.ts');
const REGISTRY_FILE = join(ROOT_DIR, 'src/engine/registry.ts');
const NODES_DIR = join(ROOT_DIR, 'src/components/Nodes');
const NODE_CANVAS_FILE = join(ROOT_DIR, 'src/components/Canvas/NodeCanvas.tsx');

// Types
type NodeCategory = 'input' | 'instruments' | 'effects' | 'routing' | 'output' | 'utility';
type NodeStructure = 'atomic' | 'hierarchical';

interface NodeConfig {
    name: string;           // e.g., "Reverb"
    type: string;           // e.g., "reverb" (kebab-case)
    category: NodeCategory;
    structure: NodeStructure;
    hasAudioInput: boolean;
    hasAudioOutput: boolean;
    hasControlInput: boolean;
    hasControlOutput: boolean;
    generateCss: boolean;
}

// Helpers
function toKebabCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase();
}

function toPascalCase(str: string): string {
    return str
        .split(/[-_\s]+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
}

function prompt(question: string): Promise<string> {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

async function promptChoice<T extends string>(question: string, choices: T[]): Promise<T> {
    console.log(question);
    choices.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
    const answer = await prompt('Enter number: ');
    const index = parseInt(answer) - 1;
    if (index >= 0 && index < choices.length) {
        return choices[index];
    }
    console.log(`Invalid choice, defaulting to: ${choices[0]}`);
    return choices[0];
}

async function promptYesNo(question: string, defaultValue = true): Promise<boolean> {
    const suffix = defaultValue ? '[Y/n]' : '[y/N]';
    const answer = await prompt(`${question} ${suffix}: `);
    if (answer === '') return defaultValue;
    return answer.toLowerCase().startsWith('y');
}

// Template generators
function generateTypesAddition(nodeType: string): string {
    return `    | '${nodeType}'`;
}

function generateRegistryEntry(config: NodeConfig): string {
    const ports: string[] = [];

    if (config.hasAudioInput) {
        ports.push(`            { id: 'audio-in', name: 'Audio In', type: 'audio', direction: 'input', position: { x: 0, y: 0.5 } }`);
    }
    if (config.hasControlInput) {
        ports.push(`            { id: 'control-in', name: 'Control', type: 'control', direction: 'input', position: { x: 0, y: ${config.hasAudioInput ? '0.7' : '0.5'} } }`);
    }
    if (config.hasAudioOutput) {
        ports.push(`            { id: 'audio-out', name: 'Audio Out', type: 'audio', direction: 'output', position: { x: 1, y: 0.5 } }`);
    }
    if (config.hasControlOutput) {
        ports.push(`            { id: 'control-out', name: 'Control', type: 'control', direction: 'output', position: { x: 1, y: ${config.hasAudioOutput ? '0.7' : '0.5'} } }`);
    }

    const portsStr = ports.length > 0 ? `[\n${ports.join(',\n')}\n        ]` : '[]';

    return `
    ${config.type}: {
        type: '${config.type}',
        category: '${config.category}',
        name: '${config.name}',
        description: '${config.name} node',
        defaultPorts: ${portsStr},
        defaultData: {},
        dimensions: { width: 160, height: 100 },
        canEnter: ${config.structure === 'hierarchical'}
    },`;
}

function generateComponent(config: NodeConfig): string {
    const componentName = `${toPascalCase(config.name)}Node`;
    const className = config.type + '-node';
    const cssImport = config.generateCss ? `import './${componentName}.css';\n` : '';

    return `/**
 * ${config.name} Node
 *
 * Category: ${config.category}
 * Structure: ${config.structure}
 */

import { memo } from 'react';
import type { GraphNode } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
${cssImport}
// Define your node's data interface
interface ${componentName}Data {
    // Add your custom properties here
    // Example: gain?: number;
}

interface ${componentName}Props {
    node: GraphNode;
    handlePortMouseDown?: (portId: string, e: React.MouseEvent) => void;
    handlePortMouseUp?: (portId: string, e: React.MouseEvent) => void;
    handlePortMouseEnter?: (portId: string) => void;
    handlePortMouseLeave?: () => void;
    hasConnection: (portId: string) => boolean;
    handleHeaderMouseDown: (e: React.MouseEvent) => void;
    handleNodeMouseEnter: () => void;
    handleNodeMouseLeave: () => void;
    isSelected: boolean;
    isDragging: boolean;
    isHoveredWithConnections?: boolean;
    incomingConnectionCount?: number;
    style: React.CSSProperties;
}

export const ${componentName} = memo(function ${componentName}({
    node,
    handlePortMouseDown,
    handlePortMouseUp,
    handlePortMouseEnter,
    handlePortMouseLeave,
    hasConnection,
    handleHeaderMouseDown,
    handleNodeMouseEnter,
    handleNodeMouseLeave,
    isSelected,
    isDragging,
    style
}: ${componentName}Props) {
    // Access node data with type safety
    const data = node.data as ${componentName}Data;

    // Store access for updates
    const updateNodeData = useGraphStore(s => s.updateNodeData);

    // Example: Update a value
    // const handleValueChange = (newValue: number) => {
    //     updateNodeData<${componentName}Data>(node.id, { gain: newValue });
    // };

    return (
        <div
            className={\`schematic-node ${className} \${isSelected ? 'selected' : ''} \${isDragging ? 'dragging' : ''}\`}
            style={style}
            onMouseEnter={handleNodeMouseEnter}
            onMouseLeave={handleNodeMouseLeave}
        >
            {/* Header */}
            <div className="schematic-header" onMouseDown={handleHeaderMouseDown}>
                <span className="schematic-title">${config.name}</span>
            </div>

            {/* Content */}
            <div className="${className}-content">
                {/* Add your node content here */}
                <div className="${className}-body">
                    {/* Example: Display a value */}
                    {/* <span>{data.gain ?? 1.0}</span> */}
                </div>
            </div>

            {/* Ports */}
            <div className="${className}-ports">
${config.hasAudioInput ? `                {/* Audio Input */}
                <div
                    className={\`${className}-port input \${hasConnection('audio-in') ? 'connected' : ''}\`}
                    data-node-id={node.id}
                    data-port-id="audio-in"
                    onMouseDown={(e) => handlePortMouseDown?.('audio-in', e)}
                    onMouseUp={(e) => handlePortMouseUp?.('audio-in', e)}
                    onMouseEnter={() => handlePortMouseEnter?.('audio-in')}
                    onMouseLeave={handlePortMouseLeave}
                    style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)' }}
                />
` : ''}${config.hasAudioOutput ? `                {/* Audio Output */}
                <div
                    className={\`${className}-port output \${hasConnection('audio-out') ? 'connected' : ''}\`}
                    data-node-id={node.id}
                    data-port-id="audio-out"
                    onMouseDown={(e) => handlePortMouseDown?.('audio-out', e)}
                    onMouseUp={(e) => handlePortMouseUp?.('audio-out', e)}
                    onMouseEnter={() => handlePortMouseEnter?.('audio-out')}
                    onMouseLeave={handlePortMouseLeave}
                    style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' }}
                />
` : ''}            </div>
        </div>
    );
});
`;
}

function generateCss(config: NodeConfig): string {
    const className = config.type + '-node';

    return `/**
 * ${config.name} Node Styles
 */

.${className} {
    /* Node container */
    position: relative;
    min-width: 160px;
    min-height: 100px;
}

.${className}-content {
    padding: 8px;
}

.${className}-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.${className}-ports {
    position: absolute;
    inset: 0;
    pointer-events: none;
}

.${className}-port {
    position: absolute;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--port-color, #4a9eff);
    border: 2px solid var(--port-border, #2a2a4e);
    pointer-events: auto;
    cursor: crosshair;
    transition: transform 0.1s, background 0.1s;
}

.${className}-port:hover {
    transform: scale(1.2);
    background: var(--port-hover, #6ab0ff);
}

.${className}-port.connected {
    background: var(--port-connected, #4aff9e);
}

.${className}-port.input {
    left: -6px;
}

.${className}-port.output {
    right: -6px;
}
`;
}

function generateNodeWrapperCase(config: NodeConfig): string {
    const componentName = `${toPascalCase(config.name)}Node`;
    return `        case '${config.type}':
            return <${componentName} node={node} {...handlers} />;`;
}

// File modification functions
function addToTypes(nodeType: string): boolean {
    try {
        let content = readFileSync(TYPES_FILE, 'utf-8');

        // Check if already exists
        if (content.includes(`'${nodeType}'`)) {
            console.log(`  - Type '${nodeType}' already exists in types.ts`);
            return false;
        }

        // Find the NodeType union and add our type
        // Look for the last entry before the semicolon
        const nodeTypeMatch = content.match(/export type NodeType\s*=[\s\S]*?;/);
        if (!nodeTypeMatch) {
            console.error('Could not find NodeType definition in types.ts');
            return false;
        }

        const nodeTypeStr = nodeTypeMatch[0];
        const lastPipe = nodeTypeStr.lastIndexOf('|');
        const semicolonPos = nodeTypeStr.lastIndexOf(';');

        // Get the last type entry
        const lastTypeSection = nodeTypeStr.slice(lastPipe, semicolonPos);
        const newContent = content.replace(
            nodeTypeStr,
            nodeTypeStr.slice(0, lastPipe) + lastTypeSection.replace(';', '') + '\n' + generateTypesAddition(nodeType) + ';'
        );

        writeFileSync(TYPES_FILE, newContent);
        console.log(`  + Added '${nodeType}' to NodeType in types.ts`);
        return true;
    } catch (error) {
        console.error('Error updating types.ts:', error);
        return false;
    }
}

function addToRegistry(config: NodeConfig): boolean {
    try {
        let content = readFileSync(REGISTRY_FILE, 'utf-8');

        // Check if already exists
        if (content.includes(`${config.type}:`)) {
            console.log(`  - Entry for '${config.type}' already exists in registry.ts`);
            return false;
        }

        // Find the end of nodeDefinitions object (before the closing };)
        const closingMatch = content.match(/^};\s*$/m);
        if (!closingMatch || closingMatch.index === undefined) {
            console.error('Could not find end of nodeDefinitions in registry.ts');
            return false;
        }

        const insertPos = closingMatch.index;
        const newContent = content.slice(0, insertPos) + generateRegistryEntry(config) + '\n' + content.slice(insertPos);

        writeFileSync(REGISTRY_FILE, newContent);
        console.log(`  + Added '${config.type}' to nodeDefinitions in registry.ts`);
        return true;
    } catch (error) {
        console.error('Error updating registry.ts:', error);
        return false;
    }
}

function createComponentFile(config: NodeConfig): boolean {
    const componentName = `${toPascalCase(config.name)}Node`;
    const filePath = join(NODES_DIR, `${componentName}.tsx`);

    if (existsSync(filePath)) {
        console.log(`  - Component file ${componentName}.tsx already exists`);
        return false;
    }

    try {
        writeFileSync(filePath, generateComponent(config));
        console.log(`  + Created ${componentName}.tsx`);
        return true;
    } catch (error) {
        console.error('Error creating component file:', error);
        return false;
    }
}

function createCssFile(config: NodeConfig): boolean {
    if (!config.generateCss) return true;

    const componentName = `${toPascalCase(config.name)}Node`;
    const filePath = join(NODES_DIR, `${componentName}.css`);

    if (existsSync(filePath)) {
        console.log(`  - CSS file ${componentName}.css already exists`);
        return false;
    }

    try {
        writeFileSync(filePath, generateCss(config));
        console.log(`  + Created ${componentName}.css`);
        return true;
    } catch (error) {
        console.error('Error creating CSS file:', error);
        return false;
    }
}

function addToNodeWrapper(config: NodeConfig): boolean {
    try {
        let content = readFileSync(NODE_CANVAS_FILE, 'utf-8');
        const componentName = `${toPascalCase(config.name)}Node`;

        // Check if import already exists
        if (!content.includes(`import { ${componentName} }`)) {
            // Add import after other node imports
            const importMatch = content.match(/import \{ \w+Node \} from '\.\.\/Nodes\/\w+Node';/g);
            if (importMatch && importMatch.length > 0) {
                const lastImport = importMatch[importMatch.length - 1];
                content = content.replace(
                    lastImport,
                    `${lastImport}\nimport { ${componentName} } from '../Nodes/${componentName}';`
                );
                console.log(`  + Added import for ${componentName}`);
            }
        }

        // Check if case already exists
        if (content.includes(`case '${config.type}':`)) {
            console.log(`  - Case for '${config.type}' already exists in NodeCanvas`);
            writeFileSync(NODE_CANVAS_FILE, content);
            return false;
        }

        // Find the switch statement and add our case
        // Look for a case statement to insert before the default
        const defaultMatch = content.match(/(\s+)default:\s*\n\s+return null;/);
        if (defaultMatch && defaultMatch.index !== undefined) {
            const indent = defaultMatch[1];
            const caseStatement = generateNodeWrapperCase(config);
            content = content.slice(0, defaultMatch.index) +
                `${indent}${caseStatement.trim()}\n` +
                content.slice(defaultMatch.index);

            writeFileSync(NODE_CANVAS_FILE, content);
            console.log(`  + Added case for '${config.type}' in NodeCanvas`);
            return true;
        } else {
            console.error('Could not find switch default case in NodeCanvas.tsx');
            return false;
        }
    } catch (error) {
        console.error('Error updating NodeCanvas.tsx:', error);
        return false;
    }
}

// Main execution
async function main() {
    console.log('\n🎛️  OpenJammer Node Scaffolding Tool\n');
    console.log('This tool will create all the files needed for a new node.\n');

    // Parse command line arguments
    const args = process.argv.slice(2);
    let config: Partial<NodeConfig> = {};

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const next = args[i + 1];

        if (arg === '--name' && next) {
            config.name = next;
            config.type = toKebabCase(next);
            i++;
        } else if (arg === '--category' && next) {
            config.category = next as NodeCategory;
            i++;
        } else if (arg === '--type' && next) {
            config.structure = next as NodeStructure;
            i++;
        } else if (arg === '--help' || arg === '-h') {
            console.log('Usage: bun run create-node [options]\n');
            console.log('Options:');
            console.log('  --name <name>       Node name (e.g., "Reverb")');
            console.log('  --category <cat>    Category: input, instruments, effects, routing, output, utility');
            console.log('  --type <type>       Structure: atomic, hierarchical');
            console.log('  --help, -h          Show this help\n');
            process.exit(0);
        }
    }

    // Interactive prompts for missing values
    if (!config.name) {
        config.name = await prompt('Node name (e.g., "Reverb"): ');
        if (!config.name) {
            console.error('Node name is required');
            process.exit(1);
        }
        config.type = toKebabCase(config.name);
    }

    console.log(`\nNode type will be: ${config.type}`);

    if (!config.category) {
        config.category = await promptChoice('Category:', [
            'effects',
            'input',
            'instruments',
            'routing',
            'output',
            'utility'
        ] as NodeCategory[]);
    }

    if (!config.structure) {
        config.structure = await promptChoice('Structure:', [
            'atomic',
            'hierarchical'
        ] as NodeStructure[]);
    }

    // Port configuration
    console.log('\nPort configuration:');
    config.hasAudioInput = await promptYesNo('Has audio input?', config.category === 'effects' || config.category === 'output');
    config.hasAudioOutput = await promptYesNo('Has audio output?', config.category === 'effects' || config.category === 'instruments' || config.category === 'input');
    config.hasControlInput = await promptYesNo('Has control input?', config.category === 'instruments');
    config.hasControlOutput = await promptYesNo('Has control output?', config.category === 'input');
    config.generateCss = await promptYesNo('Generate CSS file?', true);

    const finalConfig = config as NodeConfig;

    console.log('\n📝 Creating files...\n');

    // Create all files
    addToTypes(finalConfig.type);
    addToRegistry(finalConfig);
    createComponentFile(finalConfig);
    createCssFile(finalConfig);
    addToNodeWrapper(finalConfig);

    console.log('\n✅ Done!\n');
    console.log('Next steps:');
    console.log(`  1. Edit src/components/Nodes/${toPascalCase(finalConfig.name)}Node.tsx`);
    console.log(`  2. Add your node's UI and logic`);
    if (finalConfig.hasAudioInput || finalConfig.hasAudioOutput) {
        console.log(`  3. Integrate with AudioGraphManager (see docs/creating-nodes.md)`);
    }
    if (finalConfig.structure === 'hierarchical') {
        console.log(`  4. Add internal structure in src/utils/nodeInternals.ts`);
    }
    console.log(`  5. Test your node: bun run dev\n`);
}

main().catch(console.error);
