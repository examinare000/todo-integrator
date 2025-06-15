// Azure App Configuration for Todo Integrator Plugin
// Multi-tenant application registration for public distribution

export const AZURE_APP_CONFIG = {
    // Multi-tenant Azure App Client ID 
    // This is a public client ID that can be safely embedded in the plugin
    CLIENT_ID: '98e4e49b-7643-44c4-8308-4a19211f23ce',
    
    // Tenant ID for multi-tenant applications
    TENANT_ID: 'common',
    
    // Microsoft Graph API scopes required for the plugin
    SCOPES: [
        'https://graph.microsoft.com/Tasks.ReadWrite',
        'https://graph.microsoft.com/User.Read'
    ],
    
    // Authority URL for Microsoft authentication
    AUTHORITY: 'https://login.microsoftonline.com/common'
} as const;

// Development/Testing configuration (can be overridden)
export const DEV_CONFIG = {
    CLIENT_ID: process.env.AZURE_CLIENT_ID || AZURE_APP_CONFIG.CLIENT_ID,
    TENANT_ID: process.env.AZURE_TENANT_ID || AZURE_APP_CONFIG.TENANT_ID
} as const;

// Export the configuration to use based on environment
export const getAzureConfig = () => {
    // Use development config if environment variables are set
    if (process.env.NODE_ENV === 'development' && process.env.AZURE_CLIENT_ID) {
        return DEV_CONFIG;
    }
    
    return AZURE_APP_CONFIG;
};
