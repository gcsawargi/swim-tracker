'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
	ConfirmationResult,
	RecaptchaVerifier,
	onAuthStateChanged,
	signInWithPhoneNumber
} from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { getFirebaseAuth } from '../lib/firebase';

declare global {
	interface Window {
		recaptchaVerifier?: RecaptchaVerifier;
	}
}

function getAuthErrorMessage(error: unknown, fallback: string) {
	if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
		const code = String((error as { code: unknown }).code);
		const message = String((error as { message: unknown }).message);
		return `${code}: ${message}`;
	}

	if (error instanceof Error) {
		return error.message;
	}

	return fallback;
}

function createRecaptchaVerifier() {
	const auth = getFirebaseAuth();

	if (typeof window === 'undefined') {
		return null;
	}

	if (!auth) {
		return null;
	}

	if (!window.recaptchaVerifier) {
		window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
			size: 'normal'
		});
	}

	return window.recaptchaVerifier;
}

export default function LoginPage() {
	const router = useRouter();
	const [phoneNumber, setPhoneNumber] = useState('');
	const [otpCode, setOtpCode] = useState('');
	const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
	const [requestedPhoneNumber, setRequestedPhoneNumber] = useState('');
	const [isSendingCode, setIsSendingCode] = useState(false);
	const [isVerifyingCode, setIsVerifyingCode] = useState(false);
	const [errorMessage, setErrorMessage] = useState('');
	const hasRenderedRecaptcha = useRef(false);

	function getMaskedPhoneNumber(number: string) {
		if (number.length < 5) {
			return `+91 ${number}`;
		}

		const firstTwo = number.slice(0, 2);
		const lastThree = number.slice(-3);
		const masked = '*'.repeat(Math.max(number.length - 5, 0));

		return `+91 ${firstTwo}${masked}${lastThree}`;
	}

	useEffect(() => {
		const auth = getFirebaseAuth();

		if (!auth) {
			setErrorMessage('Firebase auth is not configured. Add your public Firebase keys to .env.local.');
			return;
		}

		auth.useDeviceLanguage();

		const unsubscribe = onAuthStateChanged(auth, (user) => {
			if (user) {
				router.replace('/dashboard');
			}
		});

		return unsubscribe;
	}, [router]);

	useEffect(() => {
		if (hasRenderedRecaptcha.current) {
			return;
		}

		const verifier = createRecaptchaVerifier();

		if (!verifier) {
			setErrorMessage('Unable to initialize reCAPTCHA. Check Firebase Auth config and allowed domains.');
			return;
		}

		verifier.render().catch((error) => {
			setErrorMessage(
				getAuthErrorMessage(
					error,
					'Could not start the reCAPTCHA challenge. Refresh and try again.'
				)
			);
		});
		hasRenderedRecaptcha.current = true;

		return () => {
			window.recaptchaVerifier?.clear();
			window.recaptchaVerifier = undefined;
			hasRenderedRecaptcha.current = false;
		};
	}, []);

	const canSendCode = useMemo(() => /^\d{10}$/.test(phoneNumber), [phoneNumber]);
	const canVerifyCode = useMemo(
		() => confirmationResult !== null && otpCode.trim().length >= 6,
		[confirmationResult, otpCode]
	);

	async function handleSendCode() {
		const verifier = createRecaptchaVerifier();

		if (!verifier) {
			setErrorMessage('This login flow only runs in the browser.');
			return;
		}

		setErrorMessage('');
		setIsSendingCode(true);

		try {
			const auth = getFirebaseAuth();

			if (!auth) {
				throw new Error('Firebase auth is not configured.');
			}

			const result = await signInWithPhoneNumber(auth, `+91${phoneNumber}`, verifier);
			setConfirmationResult(result);
			setRequestedPhoneNumber(phoneNumber);
		} catch (error) {
			setErrorMessage(getAuthErrorMessage(error, 'The verification SMS could not be sent.'));

			try {
				const widgetId = await verifier.render();
				if (typeof window !== 'undefined' && 'grecaptcha' in window) {
					const grecaptcha = (window as Window & {
						grecaptcha?: { reset: (id: number) => void };
					}).grecaptcha;

					grecaptcha?.reset(widgetId);
				}
			} catch {
				setErrorMessage('The SMS attempt failed and the reCAPTCHA could not be reset.');
			}
		} finally {
			setIsSendingCode(false);
		}
	}

	async function handleVerifyCode() {
		if (!confirmationResult) {
			return;
		}

		setErrorMessage('');
		setIsVerifyingCode(true);

		try {
			const auth = getFirebaseAuth();

			if (!auth) {
				throw new Error('Firebase auth is not configured.');
			}

			await confirmationResult.confirm(otpCode.trim());
			router.replace('/dashboard');
		} catch (error) {
			setErrorMessage(
				error instanceof Error
					? error.message
					: 'The OTP code is invalid or expired.'
			);
		} finally {
			setIsVerifyingCode(false);
		}
	}

	return (
		<main className="shell minimal-login">
			<section className="panel">
				<header className="hero">
					<span className="login-icon" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none" role="presentation">
							<rect x="3" y="4" width="18" height="16" rx="4" />
							<path d="M7 9h10M7 12h7M7 15h5" />
						</svg>
					</span>
					<h1 className="title">Swim Tracker</h1>
					<p className="subtitle">
						Welcome back! Please sign in to continue.
					</p>
				</header>

				<div className="auth-grid auth-grid--single">
					<section className="stack login-section">
						{!confirmationResult ? (
							<div className="field-grid">
								<label className="field-label" htmlFor="phone-number">
									<span>Phone number</span>
									<div className="phone-input-wrap">
										<span className="phone-prefix" aria-hidden="true">
											+91
										</span>
										<input
											id="phone-number"
											className="input phone-input"
											autoComplete="tel-national"
											inputMode="numeric"
											placeholder=""
											maxLength={10}
											value={phoneNumber}
											onChange={(event) =>
												setPhoneNumber(event.target.value.replace(/\D/g, '').slice(0, 10))
											}
										/>
									</div>
									<div>
										<p className="section-copy" style={{ textAlign: 'center' }}>
											Enter your 10-digit mobile number.
										</p>
									</div>
								</label>

								<div id="recaptcha-container" />

								<div className="button-row">
									<button
										type="button"
										className="button"
										disabled={!canSendCode || isSendingCode}
										onClick={handleSendCode}
									>
										{isSendingCode ? 'Sending code...' : 'Send verification code'}
									</button>
								</div>
							</div>
						) : (
							<div className="field-grid">
								<div className="otp-top-row">
									<div className="status otp-status-banner" style={{ textAlign: 'center' }}>
										OTP sent to {getMaskedPhoneNumber(requestedPhoneNumber)}
									</div>
									<button
										type="button"
										className="ghost-button otp-change-btn"
										onClick={() => {
											setConfirmationResult(null);
											setOtpCode('');
											setErrorMessage('');
										}}
									>
										Change phone number
									</button>
								</div>

								<label className="field-label" htmlFor="otp-code">
									<span>Verification code</span>
									<input
										id="otp-code"
										className="input"
										autoComplete="one-time-code"
										inputMode="numeric"
										placeholder=""
										value={otpCode}
										onChange={(event) => setOtpCode(event.target.value)}
									/>
								</label>

								<div className="button-row">
									<button
										type="button"
										className="button"
										disabled={!canVerifyCode || isVerifyingCode}
										onClick={handleVerifyCode}
									>
										{isVerifyingCode ? 'Verifying...' : 'Verify and continue'}
									</button>
								</div>
							</div>
						)}

						{errorMessage ? <div className="error">{errorMessage}</div> : null}
					</section>
				</div>
			</section>
		</main>
	);
}
