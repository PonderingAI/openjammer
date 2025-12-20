import { useCanvasNavigationStore } from '../../store/canvasNavigationStore';
import './LevelBreadcrumb.css';

export function LevelBreadcrumb() {
    const currentViewNodeId = useCanvasNavigationStore(s => s.currentViewNodeId);
    const getCurrentPath = useCanvasNavigationStore(s => s.getCurrentPath);
    const exitToParent = useCanvasNavigationStore(s => s.exitToParent);
    const exitToRoot = useCanvasNavigationStore(s => s.exitToRoot);

    // Don't show at root level
    if (currentViewNodeId === null) {
        return null;
    }

    // Get path from root to current view
    const path = getCurrentPath();

    // Build breadcrumb items from path
    const breadcrumbItems = path.map((node) => {
        const label = `${node.type} ${node.id.slice(0, 8)}`;
        return { label, nodeId: node.id };
    });

    return (
        <div className="level-breadcrumb">
            <button
                className="breadcrumb-item root"
                onClick={() => exitToRoot()}
                title="Return to root"
            >
                🏠
            </button>
            {breadcrumbItems.map((item) => (
                <span key={item.nodeId} className="breadcrumb-segment">
                    <span className="breadcrumb-separator">›</span>
                    <span className="breadcrumb-item">
                        {item.label}
                    </span>
                </span>
            ))}
            <button
                className="breadcrumb-back"
                onClick={() => exitToParent()}
                title="Go back up (Q)"
            >
                ← Back (Q)
            </button>
        </div>
    );
}
