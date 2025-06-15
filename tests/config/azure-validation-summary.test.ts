import { describe, it, expect } from '@jest/globals';
import { getAzureConfig } from '../../src/config/app-config';
import { MSALAuthenticationManager } from '../../src/auth/msal-authentication-manager';
import { Logger } from '../../src/utils/logger';
import { ErrorHandler } from '../../src/utils/error-handler';

/**
 * Azure App Registration Validation Summary
 * This test provides a quick health check of the Azure configuration
 */
describe('Azure App Registration - Health Check Summary', () => {
    it('should validate all critical Azure app configuration', async () => {
        const config = getAzureConfig();
        const logger = new Logger();
        logger.setLogLevel('error');
        const errorHandler = new ErrorHandler(logger);
        
        console.log('\n=== Azure App Registration Health Check ===');
        console.log(`Client ID: ${config.CLIENT_ID}`);
        console.log(`Tenant ID: ${config.TENANT_ID}`);
        console.log(`Authority: ${config.AUTHORITY}`);
        console.log(`Scopes: ${config.SCOPES.join(', ')}`);
        console.log('===========================================\n');
        
        const results: { [key: string]: { status: 'PASS' | 'FAIL' | 'WARN', message: string } } = {};

        // 1. Client ID format validation
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        results.clientIdFormat = {
            status: uuidRegex.test(config.CLIENT_ID) ? 'PASS' : 'FAIL',
            message: 'Client ID should be a valid UUID format'
        };

        // 2. Multi-tenant configuration
        results.multiTenant = {
            status: config.TENANT_ID === 'common' ? 'PASS' : 'FAIL',
            message: 'Tenant ID should be "common" for multi-tenant apps'
        };

        // 3. Authority URL validation
        results.authorityUrl = {
            status: config.AUTHORITY.startsWith('https://login.microsoftonline.com/') ? 'PASS' : 'FAIL',
            message: 'Authority URL should point to Microsoft login endpoint'
        };

        // 4. Required scopes validation
        const requiredScopes = [
            'https://graph.microsoft.com/Tasks.ReadWrite',
            'https://graph.microsoft.com/User.Read'
        ];
        const hasAllScopes = requiredScopes.every(scope => config.SCOPES.includes(scope));
        results.requiredScopes = {
            status: hasAllScopes ? 'PASS' : 'FAIL',
            message: 'Must include Tasks.ReadWrite and User.Read scopes'
        };

        // 5. MSAL client initialization
        let msalInitSuccess = false;
        let msalError = '';
        try {
            const authManager = new MSALAuthenticationManager(logger, errorHandler);
            await authManager.initialize();
            msalInitSuccess = true;
        } catch (error: any) {
            msalError = error.message || error.toString();
            
            // Check for specific Azure AD errors
            if (msalError.includes('AADSTS70002')) {
                msalError = 'Application not found - Client ID may be incorrect';
            } else if (msalError.includes('AADSTS90002')) {
                msalError = 'Tenant not found - Tenant ID may be incorrect';
            } else if (msalError.includes('AADSTS700016')) {
                msalError = 'App not configured as public client in Azure Portal';
            }
        }
        
        results.msalInitialization = {
            status: msalInitSuccess ? 'PASS' : 'FAIL',
            message: msalInitSuccess ? 'MSAL client initialized successfully' : `MSAL init failed: ${msalError}`
        };

        // 6. Network connectivity test (optional)
        let metadataAccessible = false;
        try {
            const response = await fetch(`${config.AUTHORITY}/v2.0/.well-known/openid_configuration`, {
                method: 'GET',
                timeout: 5000
            } as any);
            metadataAccessible = response.ok;
        } catch (error) {
            // Network errors are acceptable in test environments
        }
        
        results.networkConnectivity = {
            status: metadataAccessible ? 'PASS' : 'WARN',
            message: metadataAccessible ? 'Azure metadata endpoint accessible' : 'Network connectivity issue (acceptable in test env)'
        };

        // Print detailed results
        console.log('📋 Validation Results:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        Object.entries(results).forEach(([test, result]) => {
            const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
            console.log(`${icon} ${test}: ${result.status} - ${result.message}`);
        });
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Critical validations that must pass
        expect(results.clientIdFormat.status).toBe('PASS');
        expect(results.multiTenant.status).toBe('PASS');
        expect(results.authorityUrl.status).toBe('PASS');
        expect(results.requiredScopes.status).toBe('PASS');
        expect(results.msalInitialization.status).toBe('PASS');

        // Network connectivity can be a warning in test environments
        if (results.networkConnectivity.status === 'FAIL') {
            console.warn('⚠️ Network connectivity test failed - this may be due to test environment restrictions');
        }

        // Provide setup recommendations if any critical tests failed
        const failedCritical = Object.entries(results).filter(([_, result]) => result.status === 'FAIL');
        if (failedCritical.length > 0) {
            console.log('\n🔧 Setup Recommendations:');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            
            failedCritical.forEach(([test, result]) => {
                switch (test) {
                    case 'msalInitialization':
                        console.log('🔹 Check Azure Portal app registration:');
                        console.log('  - Verify Client ID is correct');
                        console.log('  - Enable "Allow public client flows" in Authentication settings');
                        console.log('  - Add platform configuration for Mobile and desktop applications');
                        break;
                    case 'requiredScopes':
                        console.log('🔹 Add required API permissions in Azure Portal:');
                        console.log('  - Microsoft Graph > Tasks.ReadWrite');
                        console.log('  - Microsoft Graph > User.Read');
                        console.log('  - Grant admin consent for these permissions');
                        break;
                }
            });
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        } else {
            console.log('🎉 All critical validations passed! Azure app is correctly configured.');
        }
    });

    it('should validate specific client ID configuration', () => {
        const config = getAzureConfig();
        
        // Validate the actual client ID that was configured
        expect(config.CLIENT_ID).toBe('98e4e49b-7643-44c4-8308-4a19211f23ce');
        
        console.log(`✅ Confirmed Client ID: ${config.CLIENT_ID}`);
        console.log('✅ This Client ID should be registered in Azure Portal as a multi-tenant public client application');
    });

    it('should provide Azure Portal setup checklist', () => {
        console.log('\n📝 Azure Portal Setup Checklist:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('□ Azure Portal > App registrations > New registration');
        console.log('□ Name: "Obsidian Todo Integrator"');
        console.log('□ Supported account types: "Accounts in any organizational directory (Any Azure AD directory - Multitenant)"');
        console.log('□ Redirect URI: Not required for device code flow');
        console.log('□ API permissions > Add a permission > Microsoft Graph:');
        console.log('  □ Tasks.ReadWrite (Application permissions)');
        console.log('  □ User.Read (Delegated permissions)');
        console.log('□ Authentication > Allow public client flows: Yes');
        console.log('□ Authentication > Add platform > Mobile and desktop applications');
        console.log('□ Copy Client ID to app-config.ts');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        // This test always passes - it's just for documentation
        expect(true).toBe(true);
    });
});