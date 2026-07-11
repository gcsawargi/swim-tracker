'use client';

import {
    CollectionReference,
    FirestoreError,
    QueryDocumentSnapshot,
    QuerySnapshot,
    Timestamp,
    addDoc,
    collection,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp
} from 'firebase/firestore';
import { getFirebaseDb } from './firebase';

export const TOTAL_POOL_HOURS = 365;
export const MEMBER_COUNT = 3;
export const HOURS_PER_ENTRY = 1;
export const HOURS_PER_PERSON = TOTAL_POOL_HOURS / MEMBER_COUNT;

export type MemberRecord = {
    id: string;
    name: string;
    phoneNumber: string;
    accent?: string;
};

export type AttendanceLog = {
    id: string;
    memberId: string;
    recordedByPhoneNumber: string;
    createdAt: Timestamp | null;
};

function getMembersCollection() {
    const db = getFirebaseDb();

    if (!db) {
        return null;
    }

    return collection(db, 'members') as CollectionReference;
}

function getAttendanceLogsCollection() {
    const db = getFirebaseDb();

    if (!db) {
        return null;
    }

    return collection(db, 'attendanceLogs') as CollectionReference;
}

export function subscribeToMembers(
    onData: (members: MemberRecord[]) => void,
    onError: (error: Error) => void
) {
    const membersCollection = getMembersCollection();

    if (!membersCollection) {
        onError(new Error('Firebase is not configured for this environment.'));
        return () => undefined;
    }

    return onSnapshot(
        query(membersCollection, orderBy('name', 'asc')),
        (snapshot: QuerySnapshot) => {
            const members = snapshot.docs.map((doc: QueryDocumentSnapshot) => {
                const data = doc.data() as Omit<MemberRecord, 'id'>;

                return {
                    id: doc.id,
                    name: data.name,
                    phoneNumber: data.phoneNumber,
                    accent: data.accent
                };
            });

            onData(members);
        },
        (error: FirestoreError) => onError(error)
    );
}

export function subscribeToAttendanceLogs(
    onData: (logs: AttendanceLog[]) => void,
    onError: (error: Error) => void
) {
    const attendanceLogsCollection = getAttendanceLogsCollection();

    if (!attendanceLogsCollection) {
        onError(new Error('Firebase is not configured for this environment.'));
        return () => undefined;
    }

    return onSnapshot(
        query(attendanceLogsCollection, orderBy('createdAt', 'desc')),
        (snapshot: QuerySnapshot) => {
            const logs = snapshot.docs.map((doc: QueryDocumentSnapshot) => {
                const data = doc.data() as Omit<AttendanceLog, 'id'>;

                return {
                    id: doc.id,
                    memberId: data.memberId,
                    recordedByPhoneNumber: data.recordedByPhoneNumber,
                    createdAt: data.createdAt ?? null
                };
            });

            onData(logs);
        },
        (error: FirestoreError) => onError(error)
    );
}

export async function createAttendanceLog(
    memberId: string,
    recordedByPhoneNumber: string
) {
    const attendanceLogsCollection = getAttendanceLogsCollection();

    if (!attendanceLogsCollection) {
        throw new Error('Firebase is not configured for this environment.');
    }

    await addDoc(attendanceLogsCollection, {
        memberId,
        recordedByPhoneNumber,
        createdAt: serverTimestamp()
    });
}
