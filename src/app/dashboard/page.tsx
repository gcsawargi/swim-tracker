'use client';

import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { getFirebaseAuth } from '../../lib/firebase';
import {
	HOURS_PER_ENTRY,
	HOURS_PER_PERSON,
	TOTAL_POOL_HOURS,
	AttendanceLog,
	MemberRecord,
	createAttendanceLog,
	subscribeToAttendanceLogs,
	subscribeToMembers
} from '../../lib/firestore';

const timeFormatter = new Intl.DateTimeFormat('en-US', {
	hour: 'numeric',
	minute: '2-digit'
});

const fullDateFormatter = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	year: 'numeric'
});

const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
	weekday: 'long'
});

function formatHours(hours: number) {
	return Number(hours.toFixed(1));
}

function formatPhoneNumber(phoneNumber: string) {
	if (!phoneNumber) return '';
	return phoneNumber.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
}

function formatTimestamp(log: AttendanceLog) {
	if (!log.createdAt) {
		return 'Saving timestamp...';
	}

	const logDate = log.createdAt.toDate();
	const now = new Date();

	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const startOfLogDay = new Date(logDate.getFullYear(), logDate.getMonth(), logDate.getDate());
	const dayDiff = Math.round((startOfToday.getTime() - startOfLogDay.getTime()) / 86400000);
	const timeLabel = timeFormatter.format(logDate);

	if (dayDiff === 0) {
		return `Today at ${timeLabel}`;
	}

	if (dayDiff === 1) {
		return `Yesterday at ${timeLabel}`;
	}

	const dateLabel = fullDateFormatter.format(logDate);
	const weekdayLabel = weekdayFormatter.format(logDate);
	return `${dateLabel} (${weekdayLabel}) at ${timeLabel}`;
}

export default function DashboardPage() {
	const router = useRouter();
	const [members, setMembers] = useState<MemberRecord[]>([]);
	const [logs, setLogs] = useState<AttendanceLog[]>([]);
	const [selectedMemberId, setSelectedMemberId] = useState('');
	const [currentPhoneNumber, setCurrentPhoneNumber] = useState('');
	const [isLoading, setIsLoading] = useState(true);
	const [isAuthResolved, setIsAuthResolved] = useState(false);
	const [logError, setLogError] = useState('');
	const [isSigningOut, setIsSigningOut] = useState(false);
	const [isSubmittingOwnEntry, setIsSubmittingOwnEntry] = useState(false);

	useEffect(() => {
		const auth = getFirebaseAuth();

		if (!auth) {
			setIsLoading(false);
			setLogError('Firebase auth is not configured. Add your public Firebase keys to .env.local.');
			router.replace('/');
			return;
		}

		const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
			setIsAuthResolved(true);

			if (!user?.phoneNumber) {
				router.replace('/');
				return;
			}

			setCurrentPhoneNumber(user.phoneNumber);
		});

		const unsubscribeMembers = subscribeToMembers(
			(nextMembers) => {
				setMembers(nextMembers);
				setIsLoading(false);
				setLogError('');
			},
			(error) => {
				setIsLoading(false);
				setLogError(error.message);
			}
		);

		const unsubscribeLogs = subscribeToAttendanceLogs(
			(nextLogs) => {
				setLogs(nextLogs);
				setLogError('');
			},
			(error) => setLogError(error.message)
		);

		return () => {
			unsubscribeAuth();
			unsubscribeMembers();
			unsubscribeLogs();
		};
	}, [router]);

	const memberStats = useMemo(() => {
		const counts = logs.reduce<Record<string, number>>((accumulator, log) => {
			accumulator[log.memberId] = (accumulator[log.memberId] ?? 0) + 1;
			return accumulator;
		}, {});

		return members.map((member, index) => {
			const entryCount = counts[member.id] ?? 0;
			const estimatedHours = entryCount * HOURS_PER_ENTRY;
			const remainingHours = Math.max(HOURS_PER_PERSON - estimatedHours, 0);
			const percentUsed = Math.min((estimatedHours / HOURS_PER_PERSON) * 100, 100);
			const accent = member.accent || ['#c80560', '#146c72', '#d2793b', '#6f4bb8'][index % 3];

			return {
				...member,
				accent,
				entryCount,
				estimatedHours,
				remainingHours,
				percentUsed
			};
		});
	}, [logs, members]);

	const selectedMember = memberStats.find((member) => member.id === selectedMemberId) || null;
	const myMember = memberStats.find((member) => member.id === currentPhoneNumber) || null;
	const otherMemberStats = memberStats.filter((member) => member.id !== currentPhoneNumber);
	const isMyStatsLoading = isLoading || !isAuthResolved || !currentPhoneNumber;
	const isSwimmersLoading = isLoading || !isAuthResolved;
	const dashboardGreeting = myMember
		? `Welcome back, ${myMember.name}`
		: 'Welcome back';

	useEffect(() => {
		if (!memberStats.length) {
			setSelectedMemberId('');
			return;
		}

		const selectedIsOther = memberStats.some(
			(member) => member.id === selectedMemberId && member.id !== currentPhoneNumber
		);

		if (!selectedIsOther) {
			const firstOther = memberStats.find((member) => member.id !== currentPhoneNumber);
			setSelectedMemberId(firstOther?.id || '');
		}
	}, [memberStats, currentPhoneNumber, selectedMemberId]);
	const selectedLogs = useMemo(
		() => logs.filter((log) => log.memberId === selectedMemberId),
		[logs, selectedMemberId]
	);
	const totalEntries = logs.length;
	const totalEstimatedHours = totalEntries * HOURS_PER_ENTRY;
	const totalUsedHours = 365 - totalEntries;

	async function handleLogOwnEntry() {
		if (!currentPhoneNumber) {
			setLogError('You must be signed in to log attendance.');
			return;
		}

		if (!myMember) {
			setLogError('Your phone number is not configured in members collection.');
			return;
		}

		setIsSubmittingOwnEntry(true);
		setLogError('');

		try {
			await createAttendanceLog(myMember.id, currentPhoneNumber);
		} catch (error) {
			setLogError(
				error instanceof Error ? error.message : 'Could not save the attendance log.'
			);
		} finally {
			setIsSubmittingOwnEntry(false);
		}
	}

	async function handleSignOut() {
		const auth = getFirebaseAuth();

		if (!auth) {
			router.replace('/');
			return;
		}

		setIsSigningOut(true);

		try {
			await signOut(auth);
			window.location.assign('/');
		} finally {
			setIsSigningOut(false);
		}
	}

	return (
		<main className="shell">
			<section className="panel">
				<header className="hero stack">
					<div className="button-row" style={{ justifyContent: 'space-between' }}>
						<span className="eyebrow">Dashboard · shared 365-hour pass</span>
						<button
							type="button"
							className="ghost-button signout-button"
							disabled={isSigningOut}
							onClick={handleSignOut}
						>
							{isSigningOut ? 'Signing out...' : 'Sign out'}
						</button>
					</div>

					<div style={{ justifyContent: 'space-between' }}>
						<h1 className="section-title">{dashboardGreeting}</h1>
						<p className="subtitle">
							Keep track of your swim entries and remaining share.
						</p>
						<p className="stat-label">Each swimmer gets {formatHours(HOURS_PER_PERSON)} hours from the shared {TOTAL_POOL_HOURS}-hour
							pass, estimated at {HOURS_PER_ENTRY} hour per logged entry.</p>
					</div>
				</header>

				<div className="stack dashboard-main">
					<section className="card my-stats-card stack">
						<div className="my-stats-head">
							<div>
								<h2 className="section-title">My Swim Stats</h2>
								<p className="section-copy">
									{currentPhoneNumber
										? `Signed in as ${currentPhoneNumber}`
										: 'Loading your signed-in profile...'}
								</p>
							</div>
							<button
								type="button"
								className="button"
								disabled={isMyStatsLoading || !myMember || isSubmittingOwnEntry}
								onClick={handleLogOwnEntry}
							>
								{isSubmittingOwnEntry ? 'Logging...' : 'Log my entry'}
							</button>
						</div>

						{isMyStatsLoading ? (
							<div className="empty-state">Loading your stats...</div>
						) : myMember ? (
							<>
								<div className="my-stats-grid">
									<article className="stat">
										<span className="stat-label">My entries</span>
										<span className="stat-value">{myMember.entryCount}</span>
									</article>
									<article className="stat">
										<span className="stat-label">My estimated hours</span>
										<span className="stat-value">{formatHours(myMember.estimatedHours)}</span>
									</article>
									<article className="stat">
										<span className="stat-label">My hours left</span>
										<span className="stat-value">{formatHours(myMember.remainingHours)}</span>
									</article>
								</div>

								<div className="progress">
									<div className="progress-track">
										<div
											className="progress-fill"
											style={{ width: `${myMember.percentUsed}%` }}
										/>
									</div>
									<div className="progress-label">
										<span>{Math.round(myMember.percentUsed)}% of your share used</span>
										<span>{formatHours(HOURS_PER_PERSON)} hour share</span>
									</div>
								</div>
							</>
						) : (
							<div className="empty-state">
								Your phone number is not in members collection. Add it as a document ID in exact E.164 format.
							</div>
						)}
					</section>

					<div className="stats-grid">
						<article className="stat">
							<span className="stat-label">Group estimated hours used</span>
							<span className="stat-value">{formatHours(totalEstimatedHours)}</span>
						</article>
						<article className="stat">
							<span className="stat-label">Remaining quota</span>
							<span className="stat-value">{formatHours(totalUsedHours)} hours</span>
						</article>
					</div>

					<section className="card stack">
						<div className="my-stats-head">
							<div>
								<h2 className="section-title">Swimmers</h2>
								<p className="section-copy">
									Tap a swimmer to inspect their timeline and compare usage.
								</p>
							</div>
						</div>

						{isSwimmersLoading ? (
							<div className="empty-state">Loading swimmers and attendance logs...</div>
						) : null}

						{!isSwimmersLoading && memberStats.length === 0 ? (
							<div className="empty-state">
								Add three documents to the members collection in Firestore. Use
								each phone number in exact E.164 format as the document ID.
							</div>
						) : null}

						{!isSwimmersLoading && memberStats.length > 0 && otherMemberStats.length === 0 ? (
							<div className="empty-state">No other swimmers available to compare yet.</div>
						) : null}

						{!isSwimmersLoading ? (
							<div className="swimmers-content-grid">
								<div className="members-list">
									{otherMemberStats.map((member) => (
										<article
											key={member.id}
											className={`member-card ${member.id === selectedMemberId ? 'active' : ''}`}
										>
											<div className="member-head">
												<button
													type="button"
													className="ghost-button"
													style={{ padding: 0, border: 0, background: 'transparent', width: '100%' }}
													onClick={() => setSelectedMemberId(member.id)}
												>
													<div className="member-meta" style={{ textAlign: 'left' }}>
														<span
															className="member-badge"
															style={{ background: member.accent }}
														>
															{member.name.slice(0, 1).toUpperCase()}
														</span>
														<span>
															<span className="member-name">{member.name} · {formatPhoneNumber(member.phoneNumber)}</span>
															<span className="member-subtext">
																{member.entryCount} entries · {formatHours(member.estimatedHours)} estimated hours used
															</span>
														</span>
													</div>
													<div className="progress">
														<div className="progress-track">
															<div
																className="progress-fill"
																style={{ width: `${member.percentUsed}%` }}
															/>
														</div>
														<div className="progress-label">
															<span>{formatHours(member.remainingHours)} hours left</span>
															<span>{Math.round(member.percentUsed)}% used</span>
														</div>
													</div>
												</button>
											</div>
										</article>
									))}
								</div>

								<aside className="timeline-pane">
									<div>
										<h2 className="section-title">
											{selectedMember ? `${selectedMember.name} timeline` : 'Entry timeline'}
										</h2>
									</div>

									{selectedMember && selectedLogs.length === 0 ? (
										<div className="empty-state">No entries logged for this swimmer yet.</div>
									) : null}

									<div className="timeline-log-list">
										<div className="log-list">
											{selectedLogs.map((log) => (
												<article key={log.id} className="log-item">
													<span className="log-title">{formatTimestamp(log)}</span>
													<span className="log-subtext">
														Recorded by {selectedMember?.name ?? "Unknown user"} ({log.recordedByPhoneNumber})
													</span>
												</article>
											))}
										</div>
									</div>
								</aside>
							</div>
						) : null}

						{logError ? <div className="error">{logError}</div> : null}
					</section>
				</div>
			</section>
		</main>
	);
}
