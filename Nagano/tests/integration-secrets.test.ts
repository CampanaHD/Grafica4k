import test from 'node:test';
import assert from 'node:assert/strict';
import {saveWhatsAppConfig,getWhatsAppConfig,publicWhatsAppConfig} from '../src/services/whatsappServer';
test('integration API never returns secrets and empty form values keep server credentials',()=>{
  saveWhatsAppConfig({accessToken:'TEST_TOKEN_ONLY',appSecret:'TEST_APP_SECRET_ONLY',webhookVerifyToken:'TEST_WEBHOOK_ONLY',phoneNumberId:'123'});
  const publicValue=publicWhatsAppConfig();assert.doesNotMatch(JSON.stringify(publicValue),/TEST_TOKEN_ONLY|TEST_APP_SECRET_ONLY|TEST_WEBHOOK_ONLY/);assert.equal(publicValue.hasAccessToken,true);
  saveWhatsAppConfig({accessToken:'',appSecret:'',webhookVerifyToken:'',phoneNumberId:'456'});assert.equal(getWhatsAppConfig().accessToken,'TEST_TOKEN_ONLY');assert.equal(getWhatsAppConfig().phoneNumberId,'456');
});
