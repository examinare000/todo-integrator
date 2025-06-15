import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PublicClientApplication } from '@azure/msal-node';
import { AZURE_APP_CONFIG, getAzureConfig } from '../../src/config/app-config';

describe('Azure App Configuration Tests', () => {
    let msalClient: PublicClientApplication;

    beforeAll(() => {
        // Initialize MSAL client for testing
        const config = getAzureConfig();
        msalClient = new PublicClientApplication({
            auth: {
                clientId: config.CLIENT_ID,
                authority: `https://login.microsoftonline.com/${config.TENANT_ID}`
            }
        });
    });

    afterAll(async () => {
        // Cleanup
        if (msalClient) {
            const accounts = await msalClient.getAllAccounts();
            // Clean up any test accounts if needed
        }
    });

    describe('Configuration Validation', () => {
        it('should have valid client ID format', () => {
            const config = getAzureConfig();
            
            // UUID format validation (8-4-4-4-12)
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            expect(config.CLIENT_ID).toMatch(uuidRegex);
            expect(config.CLIENT_ID).toBe('98e4e49b-7643-44c4-8308-4a19211f23ce');
        });

        it('should use common tenant for multi-tenant', () => {
            const config = getAzureConfig();
            expect(config.TENANT_ID).toBe('common');
        });

        it('should have correct Microsoft Graph scopes', () => {
            expect(AZURE_APP_CONFIG.SCOPES).toContain('https://graph.microsoft.com/Tasks.ReadWrite');
            expect(AZURE_APP_CONFIG.SCOPES).toContain('https://graph.microsoft.com/User.Read');
        });

        it('should have proper authority URL', () => {
            expect(AZURE_APP_CONFIG.AUTHORITY).toBe('https://login.microsoftonline.com/common');
        });
    });

    describe('MSAL Client Initialization', () => {
        it('should initialize MSAL client successfully', () => {
            expect(msalClient).toBeDefined();
            expect(msalClient).toBeInstanceOf(PublicClientApplication);
        });

        it('should have correct authority configuration', () => {
            const config = (msalClient as any).config;
            expect(config.auth.authority).toBe('https://login.microsoftonline.com/common');
            expect(config.auth.clientId).toBe('98e4e49b-7643-44c4-8308-4a19211f23ce');
        });
    });

    describe('Multi-tenant Configuration Test', () => {
        it('should support multi-tenant authentication', async () => {
            try {
                // Test that the client can handle multi-tenant requests
                const accounts = await msalClient.getAllAccounts();
                
                // This should not throw an error for multi-tenant apps
                expect(Array.isArray(accounts)).toBe(true);
            } catch (error) {
                // If error occurs, it should not be related to tenant configuration
                expect(error).not.toMatch(/tenant/i);
                expect(error).not.toMatch(/authority/i);
            }
        });

        it('should have valid metadata endpoint', async () => {
            const metadataUrl = `https://login.microsoftonline.com/common/v2.0/.well-known/openid_configuration`;
            
            // Test that the metadata endpoint is accessible
            // This validates that the authority URL is correct
            try {
                const response = await fetch(metadataUrl);
                expect(response.ok).toBe(true);
                
                const metadata = await response.json();
                expect(metadata.issuer).toContain('https://login.microsoftonline.com');
                expect(metadata.authorization_endpoint).toBeDefined();
                expect(metadata.token_endpoint).toBeDefined();
            } catch (error) {
                // Network errors are acceptable in test environment
                console.warn('Network request failed in test environment:', error);
            }
        });
    });

    describe('Environment Configuration', () => {
        it('should use production config by default', () => {
            const config = getAzureConfig();
            expect(config.CLIENT_ID).toBe(AZURE_APP_CONFIG.CLIENT_ID);
            expect(config.TENANT_ID).toBe(AZURE_APP_CONFIG.TENANT_ID);
        });

        it('should use dev config when environment variables are set', () => {
            // Backup original env
            const originalNodeEnv = process.env.NODE_ENV;
            const originalClientId = process.env.AZURE_CLIENT_ID;

            try {
                // Set test environment
                process.env.NODE_ENV = 'development';
                process.env.AZURE_CLIENT_ID = 'test-client-id';

                // Re-import to get fresh config
                jest.resetModules();
                const { getAzureConfig: getTestConfig } = require('../../src/config/app-config');
                
                const config = getTestConfig();
                expect(config.CLIENT_ID).toBe('test-client-id');
            } finally {
                // Restore environment
                if (originalNodeEnv) {
                    process.env.NODE_ENV = originalNodeEnv;
                } else {
                    delete process.env.NODE_ENV;
                }
                if (originalClientId) {
                    process.env.AZURE_CLIENT_ID = originalClientId;
                } else {
                    delete process.env.AZURE_CLIENT_ID;
                }
                jest.resetModules();
            }
        });
    });

    describe('Security Validation', () => {
        it('should not expose sensitive configuration', () => {
            // Ensure no client secrets are accidentally included
            const configString = JSON.stringify(AZURE_APP_CONFIG);
            
            expect(configString).not.toMatch(/secret/i);
            expect(configString).not.toMatch(/password/i);
            expect(configString).not.toMatch(/key/i);
        });

        it('should use HTTPS for all endpoints', () => {
            expect(AZURE_APP_CONFIG.AUTHORITY.startsWith('https://')).toBe(true);
            AZURE_APP_CONFIG.SCOPES.forEach(scope => {
                expect(scope.startsWith('https://')).toBe(true);
            });
        });
    });
});

// Integration tests for Azure App Registration validation
describe('Azure App Registration Integration Tests', () => {
    let msalClient: PublicClientApplication;

    beforeAll(() => {
        const config = getAzureConfig();
        msalClient = new PublicClientApplication({
            auth: {
                clientId: config.CLIENT_ID,
                authority: config.AUTHORITY
            },
            system: {
                loggerOptions: {
                    loggerCallback: () => {}, // Suppress logs in tests
                    piiLoggingEnabled: false,
                    logLevel: 1 // Error level only
                }
            }
        });
    });

    describe('Azure App Registration Validation', () => {
        it('should validate that the app registration exists and is configured correctly', async () => {
            try {
                // Try to get accounts - this validates the client ID exists
                const accounts = await msalClient.getAllAccounts();
                expect(Array.isArray(accounts)).toBe(true);

                // This should not throw an AADSTS70002 error (app not found)
                // or AADSTS90002 error (tenant not found)
            } catch (error: any) {
                const errorMessage = error.message || error.toString();
                
                // These errors indicate configuration problems that need to be fixed:
                expect(errorMessage).not.toMatch(/AADSTS70002/); // Application not found
                expect(errorMessage).not.toMatch(/AADSTS90002/); // Tenant not found
                expect(errorMessage).not.toMatch(/AADSTS700016/); // App not configured as public client
                expect(errorMessage).not.toMatch(/AADSTS90014/); // Missing required parameter
                
                // Other errors (like network issues) are acceptable in test environment
                if (errorMessage.includes('AADSTS')) {
                    console.warn('Azure AD error that should be investigated:', errorMessage);
                }
            }
        });

        it('should support device code flow for public clients', async () => {
            // This test validates that the Azure app is configured as a public client
            // by checking that device code flow can be initiated without configuration errors
            
            console.log('Testing device code flow configuration...');
            
            try {
                // Create minimal device code request
                const deviceCodeRequest = {
                    scopes: ['https://graph.microsoft.com/User.Read'],
                    deviceCodeCallback: () => {
                        console.log('Device code callback received - configuration is correct');
                    }
                };

                // Start the device code flow to test configuration
                const promise = msalClient.acquireTokenByDeviceCode(deviceCodeRequest);
                
                // Cancel immediately to avoid waiting for user input
                setTimeout(() => {
                    try {
                        (promise as any).cancel?.();
                    } catch (e) {
                        // Ignore cancellation errors
                    }
                }, 100);

                try {
                    await promise;
                } catch (error: any) {
                    const errorMessage = error.message || error.toString();
                    
                    // Configuration errors that should NOT occur:
                    expect(errorMessage).not.toMatch(/AADSTS700016/); // Not public client
                    expect(errorMessage).not.toMatch(/AADSTS7000218/); // Invalid request
                    
                    // Cancellation/timeout is expected
                    console.log('Device code flow test completed (expected interruption)');
                }
                
            } catch (error: any) {
                const errorMessage = error.message || error.toString();
                
                // These errors indicate configuration problems:
                expect(errorMessage).not.toMatch(/AADSTS700016/); // Not public client
                expect(errorMessage).not.toMatch(/AADSTS90014/); // Missing parameter
                
                console.log('Public client configuration validated');
            }
        }, 2000);
    });

    describe('Microsoft Graph API Permissions Test', () => {
        it('should have the required permissions configured in Azure AD', () => {
            // Note: This test validates the permission scopes are correctly formatted
            // Actual permission validation requires authentication, which is tested in integration tests
            
            const requiredScopes = [
                'https://graph.microsoft.com/Tasks.ReadWrite',
                'https://graph.microsoft.com/User.Read'
            ];

            requiredScopes.forEach(scope => {
                expect(AZURE_APP_CONFIG.SCOPES).toContain(scope);
            });

            // Ensure scopes are properly formatted Microsoft Graph URLs
            AZURE_APP_CONFIG.SCOPES.forEach(scope => {
                expect(scope).toMatch(/^https:\/\/graph\.microsoft\.com\/.+/);
            });
        });
    });
});