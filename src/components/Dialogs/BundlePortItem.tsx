/**
 * Bundle Port Item - Individual bundle port with renaming capability
 */

import type { BundlePort } from '../../engine/types';

interface BundlePortItemProps {
    bundle: BundlePort;
    onRename: (bundleId: string, newName: string) => void;
}

export function BundlePortItem({ bundle, onRename }: BundlePortItemProps) {
    return (
        <div className="bundle-port-item active">
            <div
                className={`port-dot ${bundle.type}`}
                data-port-id={bundle.id}
                data-port-type={`bundle-${bundle.type}`}
            />
            <input
                type="text"
                value={bundle.name}
                onChange={(e) => onRename(bundle.id, e.target.value)}
                className="bundle-name-input"
                placeholder="Bundle name"
            />
            <span className="bundle-count">({bundle.portIds.length})</span>
        </div>
    );
}
