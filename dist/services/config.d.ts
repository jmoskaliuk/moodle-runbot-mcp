export interface PluginRef {
    srcPath: string;
    type: string;
    name: string;
}
export interface DemoConfig {
    id: string;
    name: string;
    category: string;
    categoryLabel: string;
    icon: string;
    iconBg: string;
    description: string;
    features: string[];
    plugin: PluginRef | null;
    snapshotId: string | null;
    moodleVersion: string;
    phpVersion: string;
    db: string;
    visible: boolean;
    type?: string;
    githubRepo?: string;
}
export declare function loadConfigs(): Promise<DemoConfig[]>;
export declare function getConfig(id: string): Promise<DemoConfig | undefined>;
export declare function updateConfig(id: string, mutator: (config: DemoConfig) => void): Promise<DemoConfig>;
//# sourceMappingURL=config.d.ts.map