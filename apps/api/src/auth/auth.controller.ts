import { Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  resetPasswordSchema,
  signupSchema,
  type AuthTokensDto,
  type LoginInput,
  type MeDto,
  type SignupInput,
} from '@winou/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { ENV, type Env } from '../config/env';
import { ClientIp, CurrentUser, Public, RateLimit, ZBody, type AuthUser } from '../common/decorators';
import { AppError, Unauthorized } from '../common/errors';
import { AuthService, type Session } from './auth.service';
import { ACCESS_COOKIE, CSRF_HEADER, REFRESH_COOKIE, SESSION_MARKER_COOKIE } from './guards';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @RateLimit('auth')
  @Post('signup')
  async signup(
    @ZBody(signupSchema) body: SignupInput,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @ClientIp() ip: string,
  ) {
    const s = await this.auth.signup(body, req.headers['user-agent'], ip);
    this.setCookies(reply, s);
    return this.auth.me(s.userId);
  }

  /** Web: sets httpOnly cookies and returns the profile. Mobile (client=mobile): returns tokens. */
  @Public()
  @RateLimit('auth')
  @HttpCode(200)
  @Post('login')
  async login(
    @ZBody(loginSchema) body: LoginInput,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @ClientIp() ip: string,
  ): Promise<MeDto | AuthTokensDto> {
    const s = await this.auth.login(body, req.headers['user-agent'], ip);
    if (body.client === 'mobile') return this.tokensDto(s);
    this.setCookies(reply, s);
    return this.auth.me(s.userId);
  }

  @Public()
  @RateLimit('auth')
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @ZBody(refreshSchema) body: z.infer<typeof refreshSchema>,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthTokensDto | { ok: true }> {
    if (body.refreshToken) return this.tokensDto(await this.auth.refresh(body.refreshToken, req.headers['user-agent']));
    const cookie = req.cookies?.[REFRESH_COOKIE];
    if (!cookie) throw Unauthorized();
    if (!req.headers[CSRF_HEADER]) throw new AppError(403, 'csrf');
    try {
      this.setCookies(reply, await this.auth.refresh(cookie, req.headers['user-agent']));
    } catch (e) {
      this.clearCookies(reply);
      throw e;
    }
    return { ok: true };
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(
    @ZBody(refreshSchema) body: z.infer<typeof refreshSchema>,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const cookie = req.cookies?.[REFRESH_COOKIE];
    if (cookie && !req.headers[CSRF_HEADER]) throw new AppError(403, 'csrf');
    await this.auth.logout(body.refreshToken ?? cookie);
    this.clearCookies(reply);
  }

  @Public()
  @RateLimit('auth')
  @HttpCode(204)
  @Post('forgot-password')
  async forgot(@ZBody(forgotPasswordSchema) body: z.infer<typeof forgotPasswordSchema>) {
    await this.auth.forgotPassword(body.email);
  }

  @Public()
  @RateLimit('auth')
  @HttpCode(204)
  @Post('reset-password')
  async reset(@ZBody(resetPasswordSchema) body: z.infer<typeof resetPasswordSchema>, @ClientIp() ip: string) {
    await this.auth.resetPassword(body.token, body.password, ip);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<MeDto> {
    return this.auth.me(user.id);
  }

  private tokensDto(s: Session): AuthTokensDto {
    return { accessToken: s.accessToken, refreshToken: s.refreshToken, expiresIn: this.env.ACCESS_TOKEN_TTL_SECONDS };
  }

  private setCookies(reply: FastifyReply, s: Session) {
    const base = { httpOnly: true, sameSite: 'lax' as const, secure: this.env.cookieSecure };
    void reply.setCookie(ACCESS_COOKIE, s.accessToken, { ...base, path: '/', maxAge: this.env.ACCESS_TOKEN_TTL_SECONDS });
    void reply.setCookie(REFRESH_COOKIE, s.refreshToken, {
      ...base,
      path: '/api/auth',
      expires: s.refreshExpiresAt,
    });
    // Non-secret marker so the web app's middleware knows a session may exist (the refresh
    // cookie itself is scoped to /api/auth and invisible to page requests).
    void reply.setCookie(SESSION_MARKER_COOKIE, '1', { ...base, path: '/', expires: s.refreshExpiresAt });
  }

  private clearCookies(reply: FastifyReply) {
    void reply.clearCookie(ACCESS_COOKIE, { path: '/' });
    void reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    void reply.clearCookie(SESSION_MARKER_COOKIE, { path: '/' });
  }
}
