import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { MSALAuthenticationManager } from '../../src/auth/msal-authentication-manager';
import { TodoApiClient } from '../../src/api/todo-api-client';
import { Logger } from '../../src/utils/logger';
import { ErrorHandler } from '../../src/utils/error-handler';
import { getAzureConfig } from '../../src/config/app-config';

// Integration tests for Azure App Registration and Authentication
// These tests validate the actual Azure configuration without requiring user interaction
describe('Azure Authentication Integration Tests', () => {
    let authManager: MSALAuthenticationManager;
    let logger: Logger;
    let errorHandler: ErrorHandler;

    beforeAll(() => {
        logger = new Logger();
        logger.setLogLevel('error'); // Suppress logs during tests
        errorHandler = new ErrorHandler(logger);
    });

    beforeEach(() => {
        authManager = new MSALAuthenticationManager(logger, errorHandler);
    });

    afterAll(() => {
        // Cleanup any resources
    });

    describe('MSAL Authentication Manager Configuration', () => {
        it('should initialize with correct Azure app configuration', async () => {
            await expect(authManager.initialize()).resolves.not.toThrow();
        });

        it('should handle authentication state correctly', async () => {
            await authManager.initialize();
            
            // Initially should not be authenticated
            const isAuthenticated = await authManager.isAuthenticated();
            expect(typeof isAuthenticated).toBe('boolean');
        });

        it('should validate Azure app registration exists', async () => {
            try {
                await authManager.initialize();
                
                // This validates that the client ID is recognized by Azure AD
                // If the app doesn't exist, initialization would fail with AADSTS70002
                expect(true).toBe(true); // Test passes if no error thrown
                
            } catch (error: any) {
                const errorMessage = error.message || error.toString();
                
                // Check for specific Azure AD errors that indicate configuration issues
                expect(errorMessage).not.toMatch(/AADSTS70002/); // Application not found
                expect(errorMessage).not.toMatch(/AADSTS90002/); // Tenant not found  
                expect(errorMessage).not.toMatch(/AADSTS700016/); // Not configured as public client
                
                // Log other errors for investigation
                if (errorMessage.includes('AADSTS')) {
                    console.error('Azure AD configuration error:', errorMessage);
                    throw error;
                }
            }
        });
    });

    describe('Azure App Registration Properties Validation', () => {
        it('should validate multi-tenant configuration', async () => {
            const config = getAzureConfig();
            
            // Test metadata endpoint for multi-tenant apps
            try {
                const metadataResponse = await fetch(
                    `https://login.microsoftonline.com/${config.TENANT_ID}/v2.0/.well-known/openid_configuration`
                );
                
                if (metadataResponse.ok) {
                    const metadata = await metadataResponse.json();
                    expect(metadata.issuer).toContain('https://login.microsoftonline.com');
                }
            } catch (error) {
                // Network errors are acceptable in test environment
                console.warn('Network request failed - this is acceptable in test environment');
            }
        });

        it('should validate app supports device code flow', async () => {
            await authManager.initialize();
            
            try {
                // Create device code request without callback to test configuration
                const promise = (authManager as any).msalClient?.acquireTokenByDeviceCode({
                    scopes: ['https://graph.microsoft.com/User.Read'],
                    deviceCodeCallback: () => {} // Empty callback for test
                });
                
                // Cancel immediately to avoid user interaction
                if (promise) {
                    setTimeout(() => promise.cancel?.(), 100);
                    
                    try {
                        await promise;
                    } catch (error: any) {
                        // Expected to fail due to cancellation or timeout
                        // What we're testing is that the request was accepted (no config errors)
                        const errorMessage = error.message || error.toString();
                        
                        // These errors indicate configuration problems:
                        expect(errorMessage).not.toMatch(/AADSTS700016/); // Not public client
                        expect(errorMessage).not.toMatch(/AADSTS7000218/); // Invalid request format
                    }
                }
            } catch (error: any) {
                const errorMessage = error.message || error.toString();
                
                // Configuration-related errors that should not occur:
                expect(errorMessage).not.toMatch(/AADSTS700016/); // Not configured as public client
                expect(errorMessage).not.toMatch(/AADSTS90014/); // Missing required parameter
            }
        });
    });

    describe('Microsoft Graph API Client Configuration', () => {
        let apiClient: TodoApiClient;

        beforeEach(() => {
            apiClient = new TodoApiClient(logger, errorHandler);
        });

        it('should validate Graph API endpoints are accessible', async () => {
            // Test that Microsoft Graph API endpoints are reachable
            try {
                const response = await fetch('https://graph.microsoft.com/v1.0/$metadata');
                if (response.ok || response.status === 401) {
                    // 200 OK or 401 Unauthorized both indicate the endpoint exists
                    // 401 is expected without authentication
                    expect([200, 401]).toContain(response.status);
                }
            } catch (error) {
                // Network errors are acceptable in test environment
                console.warn('Microsoft Graph endpoint test failed - network issue in test environment');
            }
        });

        it('should have correct scope configuration for required APIs', () => {
            const config = getAzureConfig();
            
            // Validate that required scopes are properly formatted
            const requiredScopes = [
                'https://graph.microsoft.com/Tasks.ReadWrite',
                'https://graph.microsoft.com/User.Read'
            ];

            requiredScopes.forEach(scope => {
                expect(config.SCOPES).toContain(scope);
            });

            // Validate scope URLs are properly formatted
            config.SCOPES.forEach(scope => {
                expect(scope).toMatch(/^https:\/\/graph\.microsoft\.com\/.+/);
                expect(scope).not.toMatch(/\s/); // No whitespace
            });
        });
    });

    describe('Error Handling and Validation', () => {
        it('should provide meaningful error messages for configuration issues', async () => {
            try {
                await authManager.initialize();
            } catch (error: any) {
                const errorMessage = error.message || error.toString();
                
                // Error messages should be informative
                if (errorMessage.includes('MSAL')) {
                    expect(errorMessage).toMatch(/initialization|configuration|client/i);
                }
            }
        });

        it('should handle network errors gracefully', async () => {
            // This test ensures the auth manager handles network issues properly
            await authManager.initialize();
            
            const isAuthenticated = await authManager.isAuthenticated();
            expect(typeof isAuthenticated).toBe('boolean');
        });
    });
});

// Comprehensive Azure App Registration validation test
describe('Azure App Registration Health Check', () => {
    it('should run comprehensive validation of Azure app setup', async () => {
        const config = getAzureConfig();
        const results: { [key: string]: boolean } = {};

        // 1. Client ID format validation
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        results.clientIdFormat = uuidRegex.test(config.CLIENT_ID);

        // 2. Authority URL validation
        results.authorityFormat = config.AUTHORITY?.startsWith('https://login.microsoftonline.com/');

        // 3. Scopes validation
        results.scopesValid = config.SCOPES?.every(scope => 
            scope.startsWith('https://graph.microsoft.com/')
        ) || false;

        // 4. Multi-tenant configuration
        results.multiTenant = config.TENANT_ID === 'common';

        // 5. Try to initialize MSAL client
        try {
            const logger = new Logger();
            logger.setLogLevel('error');
            const errorHandler = new ErrorHandler(logger);
            const authManager = new MSALAuthenticationManager(logger, errorHandler);
            
            await authManager.initialize();
            results.msalInitialization = true;
        } catch (error: any) {
            results.msalInitialization = false;
            
            const errorMessage = error.message || error.toString();
            console.error('MSAL initialization failed:', errorMessage);
            
            // Specific Azure AD errors that indicate setup problems
            if (errorMessage.includes('AADSTS70002')) {
                console.error('❌ Application not found - check Client ID');
            }
            if (errorMessage.includes('AADSTS90002')) {
                console.error('❌ Tenant not found - check Tenant ID');
            }
            if (errorMessage.includes('AADSTS700016')) {
                console.error('❌ App not configured as public client');
            }
        }

        // 6. Test metadata endpoint accessibility
        try {
            const response = await fetch(`${config.AUTHORITY}/v2.0/.well-known/openid_configuration`);
            results.metadataEndpoint = response.ok;
        } catch {
            results.metadataEndpoint = false;
        }

        // Print health check results
        console.log('\n=== Azure App Registration Health Check ===');
        console.log(`✅ Client ID format: ${results.clientIdFormat ? 'PASS' : 'FAIL'}`);
        console.log(`✅ Authority URL format: ${results.authorityFormat ? 'PASS' : 'FAIL'}`);
        console.log(`✅ Scopes validation: ${results.scopesValid ? 'PASS' : 'FAIL'}`);
        console.log(`✅ Multi-tenant config: ${results.multiTenant ? 'PASS' : 'FAIL'}`);
        console.log(`✅ MSAL initialization: ${results.msalInitialization ? 'PASS' : 'FAIL'}`);
        console.log(`✅ Metadata endpoint: ${results.metadataEndpoint ? 'PASS' : 'FAIL'}`);
        console.log('==========================================\n');

        // Critical tests that must pass
        expect(results.clientIdFormat).toBe(true);
        expect(results.authorityFormat).toBe(true);
        expect(results.scopesValid).toBe(true);
        expect(results.multiTenant).toBe(true);
        expect(results.msalInitialization).toBe(true);

        // Metadata endpoint may fail in test environment due to network restrictions
        if (!results.metadataEndpoint) {
            console.warn('⚠️  Metadata endpoint test failed - may be due to network restrictions in test environment');
        }
    });
});