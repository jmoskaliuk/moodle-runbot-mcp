export declare function confirmEmail(opts: {
    firstName: string;
    pluginName: string;
    confirmUrl: string;
}): {
    html: string;
    text: string;
};
export declare function readyEmail(opts: {
    firstName: string;
    pluginName: string;
    demoUrl: string;
}): {
    html: string;
    text: string;
};
export declare function errorEmail(opts: {
    firstName: string;
    pluginName: string;
    retryUrl: string;
}): {
    html: string;
    text: string;
};
//# sourceMappingURL=emailTemplates.d.ts.map