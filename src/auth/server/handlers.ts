import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import {
  databaseDir,
  readObjectTable,
  tablePath,
  writeJson,
} from "@backend/shared/database";
import { ensureSiinXAgent } from "@backend/lib/agent-identity";

type AuthPayload = {
  mode?: "login" | "register" | "logout";
  email?: string;
  name?: string;
  password?: string;
};

const USER_COOKIE = "eido_user_id";
const USER_EMAIL_COOKIE = "eido_user_email";
const USER_NAME_COOKIE = "eido_user_name";

export async function getAuthSession(request: NextRequest) {
  const userId = request.cookies.get(USER_COOKIE)?.value;

  if (!userId) {
    return NextResponse.json({ authenticated: false, user: null });
  }

  const users = await readObjectTable(databaseDir(), "users");
  const user = users[userId];

  if (!isRecord(user)) {
    return NextResponse.json({ authenticated: false, user: null });
  }

  return NextResponse.json({
    authenticated: true,
    user: publicUser(user),
  });
}

export async function authenticate(request: NextRequest) {
  let payload: AuthPayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式不是有效 JSON。" }, { status: 400 });
  }

  if (payload.mode === "logout") {
    const response = NextResponse.json({ authenticated: false, user: null });
    clearAuthCookies(response);
    return response;
  }

  const email = normalizeEmail(payload.email);
  const password = payload.password ?? "";

  if (!email || password.length < 4) {
    return NextResponse.json({ error: "请输入有效邮箱和至少 4 位密码。" }, { status: 400 });
  }

  const tableDir = databaseDir();
  await mkdir(tableDir, { recursive: true });
  const users = await readObjectTable(tableDir, "users");

  const existing = Object.values(users).find((user) => {
    return isRecord(user) && user.email === email;
  });

  if (payload.mode === "register") {
    if (existing) {
      if (isRecord(existing) && !existing.password_hash) {
        const repairedUserId = String(existing.id || `user_${hashValue(email).slice(0, 16)}`);
        const repairedUser = {
          ...existing,
          id: repairedUserId,
          name: payload.name?.trim() || String(existing.name || email.split("@")[0]),
          password_hash: hashPassword(password),
          updated_at: new Date().toISOString(),
        };

        users[repairedUserId] = repairedUser;
        await writeJson(tablePath(tableDir, "users"), users);
        await ensureSiinXAgent(tableDir, repairedUser);
        return signedInResponse(repairedUser);
      }

      return NextResponse.json({ error: "这个邮箱已经注册，请直接登录。" }, { status: 409 });
    }

    const now = new Date().toISOString();
    const user = {
      id: `user_${hashValue(email).slice(0, 16)}`,
      email,
      name: payload.name?.trim() || email.split("@")[0],
      password_hash: hashPassword(password),
      created_at: now,
      updated_at: now,
    };

    users[user.id] = user;
    await writeJson(tablePath(tableDir, "users"), users);
    await ensureSiinXAgent(tableDir, user);
    return signedInResponse(user);
  }

  if (!isRecord(existing) || existing.password_hash !== hashPassword(password)) {
    return NextResponse.json({ error: "邮箱或密码不正确。" }, { status: 401 });
  }

  await ensureSiinXAgent(tableDir, existing);
  return signedInResponse(existing);
}

function signedInResponse(user: Record<string, unknown>) {
  const response = NextResponse.json({
    authenticated: true,
    user: publicUser(user),
  });

  response.cookies.set(USER_COOKIE, String(user.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  response.cookies.set(USER_EMAIL_COOKIE, encodeURIComponent(String(user.email ?? "")), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  response.cookies.set(USER_NAME_COOKIE, encodeURIComponent(String(user.name ?? "")), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  return response;
}

function clearAuthCookies(response: NextResponse) {
  response.cookies.delete(USER_COOKIE);
  response.cookies.delete(USER_EMAIL_COOKIE);
  response.cookies.delete(USER_NAME_COOKIE);
}

function publicUser(user: Record<string, unknown>) {
  return {
    id: String(user.id ?? ""),
    email: typeof user.email === "string" ? user.email : null,
    name: typeof user.name === "string" ? user.name : "",
    created_at: typeof user.created_at === "string" ? user.created_at : null,
  };
}

function normalizeEmail(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function hashPassword(password: string) {
  return hashValue(`eido:${password}`);
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
