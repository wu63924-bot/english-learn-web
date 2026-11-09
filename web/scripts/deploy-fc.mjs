import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const FC = require('@alicloud/fc20230330');
const { $OpenApiUtil } = require('@alicloud/openapi-core');

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`缺少环境变量 ${name}`);
    process.exit(1);
  }
  return value;
}

const region = process.env.FC_REGION?.trim() || 'cn-beijing';
const functionName = required('FC_FUNCTION_NAME');
const zipPath = process.env.FC_ZIP?.trim() || 'fc-code.zip';

let zip;
try {
  zip = readFileSync(zipPath);
} catch {
  console.error(`找不到代码包 ${zipPath}，请先运行 build:api 并打包`);
  process.exit(1);
}
if (zip.length < 100) {
  console.error(`代码包 ${zipPath} 过小，可能打包失败`);
  process.exit(1);
}

const client = new FC.default(new $OpenApiUtil.Config({
  accessKeyId: required('ALIBABA_CLOUD_ACCESS_KEY_ID'),
  accessKeySecret: required('ALIBABA_CLOUD_ACCESS_KEY_SECRET'),
  endpoint: process.env.FC_ENDPOINT?.trim() || `fcv3.${region}.aliyuncs.com`,
  regionId: region,
  protocol: 'HTTPS'
}));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function retryable(reason) {
  const text = `${reason?.code ?? ''} ${reason?.message ?? reason}`;
  return /ConnectTimeout|ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket hang up|timeout/i.test(text);
}

async function withRetry(label, task) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await task();
    } catch (reason) {
      last = reason;
      if (attempt === 3 || !retryable(reason)) break;
      console.error(`${label}第 ${attempt} 次失败，重试：${reason?.code ?? reason?.message ?? reason}`);
      await sleep(attempt * 3000);
    }
  }
  throw new Error(`${label}失败：${last?.code ?? ''} ${last?.message ?? last}`);
}

async function main() {
  const before = await withRetry('读取函数', () => client.getFunction(functionName, new FC.GetFunctionRequest({})));
  const beforeEnv = Object.keys(before.body?.environmentVariables ?? {});

  const request = new FC.UpdateFunctionRequest({
    body: new FC.UpdateFunctionInput({
      code: new FC.InputCodeLocation({ zipFile: zip.toString('base64') })
    })
  });
  const response = await withRetry('更新函数', () => client.updateFunction(functionName, request));

  const after = await withRetry('复核函数', () => client.getFunction(functionName, new FC.GetFunctionRequest({})));
  const afterEnv = Object.keys(after.body?.environmentVariables ?? {});

  console.log(JSON.stringify({
    functionName,
    region,
    zipBytes: statSync(zipPath).size,
    requestId: response.body?.requestId,
    environmentKeysBefore: beforeEnv.length,
    environmentKeysAfter: afterEnv.length,
    environmentPreserved: beforeEnv.length === afterEnv.length && beforeEnv.every(key => afterEnv.includes(key))
  }, null, 2));

  if (beforeEnv.length !== afterEnv.length) {
    console.error('警告：环境变量数量发生变化，请立即到 FC 控制台检查配置');
    process.exitCode = 1;
  }
}

main().catch(reason => {
  console.error(`部署失败：${reason?.code ?? ''} ${reason?.message ?? reason}`);
  process.exit(1);
});
