import Foundation
import XCTest
@testable import FPStore

/// The seven-rule reconcile (decision.md section 5, plan task S2), end to end through the KT1 protocol on a
/// fake device whose facade behaves as ktstore.js does, and as a truth table on the pure classifier.
final class ReconcileTests: XCTestCase {
    let s1 = #"[{"id":1,"date":"2026-10-01"}]"#
    let s2s1 = #"[{"id":2,"date":"2026-10-02"},{"id":1,"date":"2026-10-01"}]"#
    let s3s1 = #"[{"id":3,"date":"2026-10-03"},{"id":1,"date":"2026-10-01"}]"#
    let s3s2s1 = #"[{"id":3,"date":"2026-10-03"},{"id":2,"date":"2026-10-02"},{"id":1,"date":"2026-10-01"}]"#

    /// index.html BACKUP_KEYS (4460): what a REPLACE restore deletes when the file lacks them.
    static let backupKeys: [KTKey] = [
        "kt_sessions", "kt_runs", "kt_sports", "kt_weights", "kt_prs", "kt_week", "kt_bw", "kt_routine",
        "kt_routine_backup", "kt_routine_archive", "kt_measurements", "kt_custom_ex", "kt_skips", "kt_bench_goal",
        "kt_squat_goal", "kt_5k_goal", "kt_bw_goal", "kt_coach_msgs", "kt_last_export", "kt_backup_snooze",
        "kt_hk_imported", "kt_last_review_week", "kt_log_tabs", "kt_sport_fields", "kt_cf_moves", "kt_milestones",
        "kt_ex_notes", "kt_last_plateau_week", "kt_last_prog_week", "kt_last_wrap", "kt_last_weekwrap",
        "kt_debrief_seen", "kt_profile", "kt_coach_usage", "kt_routine_next", "kt_round_intro", "kt_streak_days",
    ]

    /// A device on build 60 that has migrated and launched once more (in step).
    func migratedDevice(_ temp: TempDir, clock: TestClock = TestClock()) -> FakeDevice {
        let dev = FakeDevice(temp, clock: clock)
        dev.webkit = Seed.values
        let first = dev.launch()
        XCTAssertEqual(first["label"] as? String, "migrate")
        let second = dev.launch()
        XCTAssertEqual(second["rule"] as? Int, 0, "in step on the second launch: \(second)")
        XCTAssertEqual(dev.store.values(), dev.pageView)
        return dev
    }

    func reasons(_ dev: FakeDevice) -> [String: String] {
        var out: [String: String] = [:]
        for c in dev.store.conflicts().reversed() { out[c.key] = c.why }  // the newest reason per key
        return out
    }

    // MARK: Migration

    func testFirstLaunchCopiesEveryKeyInOnePutAndWritesASnapshot() throws {
        let temp = TempDir()
        let dev = FakeDevice(temp)
        dev.webkit = Seed.values
        let answer = dev.launch(stamp: false)
        XCTAssertEqual(answer["mode"] as? String, "shadow")
        XCTAssertEqual(answer["rule"] as? Int, 4)
        XCTAssertEqual(answer["label"] as? String, "migrate")
        let need = Set((answer["need"] as? [String] ?? []).map { KTKey($0) })
        XCTAssertEqual(need, Set(Seed.values.keys).subtracting(["kt_apikey"]), "every key but the API key")
        XCTAssertEqual(dev.store.values(), dev.pageView, "the store equals WebKit, exactly")
        XCTAssertEqual(dev.store.value("kt_user_name"), u("Kal") + [0xD83D], "a raw lone surrogate survives")
        XCTAssertNil(dev.store.value("kt_apikey"))
        XCTAssertTrue(dev.store.conflicts().isEmpty, "a migration gives nothing up")
        let snaps = dev.store.snapNames()  // waits for the snapshot queued after the put
        XCTAssertTrue(snaps.contains { $0.hasSuffix("-migrate.json") }, "\(snaps)")
        let snap = try XCTUnwrap(snaps.first { $0.hasSuffix("-migrate.json") })
        XCTAssertEqual(try dev.store.readSnap(snap), dev.pageView)
    }

    // MARK: Rule 4: older builds really delete

    func testOlderBuildResetStartNewProgrammeAndClearChatAreTombstonedNothingRefilled() throws {
        let temp = TempDir()
        let dev = migratedDevice(temp)
        let before = dev.store.values()
        // Build 59: Reset your programme (clearCustomRoutine, _routineReplaced, _setWeek(1), clearCoachHistory),
        // then Start new programme (archive, lsDel kt_routine_next and kt_round_intro).
        dev.olderBuild { wk in
            wk["kt_routine_backup"] = wk["kt_routine"]
            // archiveCurrentRoutine: the current programme joins the one already archived.
            wk["kt_routine_archive"] = u("[") + wk["kt_routine"]! + u(",") + wk["kt_routine"]! + u("]")
            wk["kt_routine"] = nil
            wk["kt_week"] = u("1")
            wk["kt_coach_msgs"] = nil
            wk["kt_routine_next"] = nil
            wk["kt_round_intro"] = nil
        }
        let deleted: [KTKey] = ["kt_routine", "kt_coach_msgs", "kt_routine_next", "kt_round_intro"]
        let answer = dev.launch(stamp: false)
        XCTAssertEqual(answer["rule"] as? Int, 4)
        XCTAssertEqual(answer["label"] as? String, "older build")
        XCTAssertNil(answer["rewrite"], "build 60 never asks for a rewrite")
        XCTAssertEqual(answer["putback"] as? Bool, false)
        let need = Set((answer["need"] as? [String] ?? []).map { KTKey($0) })
        XCTAssertEqual(need, ["kt_routine_backup", "kt_routine_archive", "kt_week", "kt_last_open"])
        for k in deleted {
            XCTAssertNil(dev.webkit[k], "\(k) is not refilled")
            XCTAssertNil(dev.store.value(k), "\(k) is tombstoned")
        }
        XCTAssertEqual(dev.store.values(), dev.pageView)
        let why = reasons(dev)
        for k in deleted + ["kt_routine_backup", "kt_routine_archive", "kt_week", "kt_last_open"] {
            XCTAssertEqual(why[k.string], "older build", "\(k)")
        }
        // Every replaced value is kept, exactly, for Put back.
        let routine = try XCTUnwrap(dev.store.conflicts().first { $0.key == "kt_routine" })
        XCTAssertEqual(dev.store.conflictValue(id: routine.id), before["kt_routine"])
        XCTAssertEqual(try RawDB(temp.file.path).int("SELECT v IS NULL FROM kv WHERE k = 'kt_routine'"), 1)

        // The next launch is in step, and still nothing comes back.
        XCTAssertEqual(dev.launch()["rule"] as? Int, 0)
        for k in deleted { XCTAssertNil(dev.webkit[k]) }
        XCTAssertEqual(dev.store.status().counts[.olderBuild], 1)
    }

    func testOlderBuildClearChatAloneIsTombstoned() {
        let temp = TempDir()
        let dev = migratedDevice(temp)
        dev.olderBuild { $0["kt_coach_msgs"] = nil }
        let answer = dev.launch()
        XCTAssertEqual(answer["rule"] as? Int, 4)
        XCTAssertNil(dev.store.value("kt_coach_msgs"))
        XCTAssertNil(dev.webkit["kt_coach_msgs"])
        XCTAssertEqual(reasons(dev)["kt_coach_msgs"], "older build")
    }

    func testOlderBuildSparseReplaceRestoreIsAdopted() {
        let temp = TempDir()
        let dev = migratedDevice(temp)
        // _applyImportedData on 59 with a sparse file (or the iCloud copy, which never carries kt_hk_imported):
        // every BACKUP key the file lacks is deleted, the Health ledger with it.
        let file: [KTKey: U16] = ["kt_sessions": u(s1), "kt_week": u("2"), "kt_coach_msgs": u("[]")]
        dev.olderBuild { wk in
            for k in Self.backupKeys where file[k] == nil { wk[k] = nil }
            for (k, v) in file { wk[k] = v }
            wk["kt_theme"] = u("dark")
            wk["kt_hk_imported"] = nil
            wk["kt_hk_last_sync"] = nil
        }
        let answer = dev.launch(stamp: false)
        XCTAssertEqual(answer["rule"] as? Int, 4)
        XCTAssertEqual(dev.store.values(), dev.pageView)
        for k in ["kt_runs", "kt_routine", "kt_routine_backup", "kt_weights", "kt_hk_imported", "kt_hk_last_sync"] {
            XCTAssertNil(dev.store.value(KTKey(k)), k)
            XCTAssertNil(dev.webkit[KTKey(k)], "\(k) not refilled")
            XCTAssertEqual(reasons(dev)[k], "older build", k)
        }
        XCTAssertEqual(dev.store.value("kt_sessions"), u(s1))
        XCTAssertEqual(dev.launch()["rule"] as? Int, 0)
    }

    // MARK: Rule 3: WebKit wiped

    func testWitnessAbsentAndNearEmptyKeepsTheStoreAndOffersPutBack() throws {
        let temp = TempDir()
        let dev = migratedDevice(temp)
        let kept = dev.store.values()
        dev.webkit = [:]  // WebKit lost everything while the store did not
        let answer = dev.launch(stamp: false)
        XCTAssertEqual(answer["mode"] as? String, "off")
        XCTAssertEqual(answer["why"] as? String, "wiped")
        XCTAssertFalse(dev.attached, "the facade stays off for this document")
        // The page boots fresh on the empty WebKit (no facade, so nothing reaches the store).
        dev.set(KTProtocol.witnessKey, dev.nextStamp())
        dev.set("kt_ids_unique", "1")
        dev.set("kt_streak_days", "{}")
        XCTAssertEqual(dev.store.values(), kept, "the store keeps its set exactly")
        let status = dev.store.status()
        let offer = try XCTUnwrap(status.wipeOffer, "Storage offers Put back")
        let snap = try XCTUnwrap(offer.snap)
        XCTAssertTrue(snap.hasSuffix("-wiped.json"))
        XCTAssertEqual(try dev.store.readSnap(snap), kept, "the snapshot holds the whole set")
        XCTAssertEqual(status.counts[.wiped], 1)

        // The next launch sees the fresh page's stamp as unknown (rule 4) and labels what it replaces "wiped".
        let follow = dev.launch()
        XCTAssertEqual(follow["rule"] as? Int, 4)
        XCTAssertEqual(dev.store.values(), dev.pageView)
        XCTAssertEqual(reasons(dev)["kt_routine"], "wiped")
        XCTAssertEqual(reasons(dev)["kt_streak_days"], "wiped")

        // The owner logs a workout on the fresh page, then puts the whole snapshot back.
        let fresh = #"[{"id":1760200000000,"date":"2026-10-11"}]"#
        dev.set("kt_sessions", fresh)
        let plan = dev.store.stagePutBack(snap: snap)
        XCTAssertGreaterThan(plan.count, 5)
        XCTAssertEqual(plan.items.first { $0.key == "kt_sessions" }?.outcome, .putBack)
        XCTAssertEqual(plan.items.first { $0.key == "kt_streak_days" }?.outcome, .putBack,
                       "lost to the wipe, not changed by the owner")
        XCTAssertTrue(dev.store.status().putBackStaged)
        let reload = dev.launch()  // the shell reloads the page; the facade writes the values at document start
        XCTAssertEqual(reload["putback"] as? Bool, true)
        XCTAssertEqual(dev.webkit["kt_routine"], kept["kt_routine"])
        XCTAssertEqual(dev.webkit["kt_streak_days"], kept["kt_streak_days"])
        XCTAssertEqual(dev.webkit["kt_coach_msgs"], kept["kt_coach_msgs"])
        // The log is merged by id: the new workout and both old ones, newest first.
        let sessions = String(decoding: try XCTUnwrap(dev.webkit["kt_sessions"]), as: UTF16.self)
        XCTAssertTrue(sessions.hasPrefix(#"[{"id":1760200000000,"date":"2026-10-11"},{"id":1760000000002"#), sessions)
        XCTAssertTrue(sessions.contains(#"{"id":1760000000001,"date":"2026-10-01","exercises":[]}"#))
        XCTAssertEqual(dev.store.values(), dev.pageView, "Put back wrote WebKit and the store alike")
        XCTAssertFalse(dev.store.status().putBackStaged)
        XCTAssertEqual(dev.launch()["rule"] as? Int, 0)
    }

    /// Rule 3 is snapshot first. When the snapshot cannot be written the store still adopts nothing, and the
    /// follow-up waits with the facade off until a snapshot of the set exists, so the set is never given up with
    /// only the 30-day conflict rows to bring it back.
    func testWipedStoreGivesNothingUpUntilASnapshotOfItExists() throws {
        let temp = TempDir()
        let dev = migratedDevice(temp)
        let kept = dev.store.values()
        let unblock = try dev.blockSnaps()
        dev.webkit = [:]
        XCTAssertEqual(dev.launch(stamp: false)["why"] as? String, "wiped")
        XCTAssertNotNil(dev.store.status().wipeOffer)
        XCTAssertNil(dev.store.status().wipeOffer?.snap, "no snapshot could be written")
        dev.set(KTProtocol.witnessKey, dev.nextStamp())  // the page boots fresh, without the facade
        dev.set("kt_streak_days", "{}")

        // The follow-up cannot write one either: it gives nothing up and keeps the facade off.
        let held = dev.launch()
        XCTAssertEqual(held["mode"] as? String, "off", "\(held)")
        XCTAssertEqual(held["why"] as? String, "wiped: no snapshot")
        XCTAssertFalse(dev.attached)
        XCTAssertEqual(dev.store.values(), kept, "the store keeps its set")
        XCTAssertTrue(dev.store.conflicts().isEmpty)
        XCTAssertEqual(dev.store.status().lastHello?.label, "wiped: no snapshot")

        // Room again: the snapshot first, then the follow-up gives the set up, every value kept.
        try unblock()
        let follow = dev.launch()
        XCTAssertEqual(follow["rule"] as? Int, 4, "\(follow)")
        let snap = try XCTUnwrap(dev.store.status().wipeOffer?.snap)
        XCTAssertTrue(snap.hasSuffix("-wiped.json"), snap)
        XCTAssertEqual(try dev.store.readSnap(snap), kept, "the snapshot holds the whole set")
        XCTAssertEqual(reasons(dev)["kt_routine"], "wiped")
        XCTAssertEqual(dev.store.values(), dev.pageView)
        XCTAssertGreaterThan(dev.store.previewPutBack(snap: snap).count, 5)
        XCTAssertEqual(dev.launch()["rule"] as? Int, 0)
    }

    /// WebKit still empty at the next start is rule 3 again; a snapshot that cannot be written then leaves the first
    /// wipe's snapshot in the offer (the store adopted nothing in between, so it holds the same set).
    func testASecondWipeKeepsTheFirstSnapshotWhenItCannotWriteItsOwn() throws {
        let temp = TempDir()
        let dev = migratedDevice(temp)
        let kept = dev.store.values()
        dev.webkit = [:]
        XCTAssertEqual(dev.launch(stamp: false)["why"] as? String, "wiped")
        let first = try XCTUnwrap(dev.store.status().wipeOffer?.snap)
        let unblock = try dev.blockSnaps()
        XCTAssertEqual(dev.launch(stamp: false)["why"] as? String, "wiped", "still empty: rule 3 again")
        XCTAssertEqual(dev.store.status().wipeOffer?.snap, first)
        try unblock()
        XCTAssertEqual(try dev.store.readSnap(first), kept)
        dev.set(KTProtocol.witnessKey, dev.nextStamp())
        XCTAssertEqual(dev.launch()["rule"] as? Int, 4, "the follow-up runs on the first snapshot")
        XCTAssertEqual(dev.store.status().wipeOffer?.snap, first)
    }

    // MARK: Rule 5: the gap note

    func testMissedMirrorABAWithAGapNoteIsAdopted() {
        let temp = TempDir()
        let dev = migratedDevice(temp)
        dev.set("kt_sessions", s2s1)  // finish a workout
        dev.set("kt_sessions", s1)  // delete it
        dev.set("kt_sessions", s2s1)  // Undo: the same JSON again
        dev.failMirror = ["kt_sessions"]
        dev.set("kt_sessions", s1)  // delete again: WebKit took it, the mirror got no answer
        dev.failMirror = []
        dev.posts.removeAll()  // and the app died before the async post arrived
        XCTAssertNotNil(dev.webkit[KTProtocol.gapKey], "the facade noted the gap")
        let kept = dev.store.conflicts().count
        dev.relaunch()
        let answer = dev.launch(stamp: false)
        XCTAssertEqual(answer["rule"] as? Int, 5)
        XCTAssertEqual(answer["label"] as? String, "gap")
        XCTAssertEqual(dev.store.value("kt_sessions"), u(s1), "the deletion stays deleted")
        XCTAssertEqual(dev.store.conflicts().count, kept, "a missed write's stale value is not offered back")
        XCTAssertEqual(dev.store.status().lastHello?.wouldRepair, [])
        XCTAssertNil(dev.webkit[KTProtocol.gapKey], "the facade drops the note once adopted")
        XCTAssertEqual(dev.launch()["rule"] as? Int, 0)
    }

    /// The residual decision.md names: a missed mirror whose gap note is lost in the same kill reads as lag.
    /// In build 60 that only miscounts (WebKit is followed), and Put back names exactly what it would bring back.
    func testMissedMirrorWithoutItsGapNoteReadsAsLag() {
        let temp = TempDir()
        let dev = migratedDevice(temp)
        dev.set("kt_sessions", s2s1)
        dev.set("kt_sessions", s1)
        dev.set("kt_sessions", s2s1)
        dev.failMirror = ["kt_sessions"]
        dev.set("kt_sessions", s1)
        dev.failMirror = []
        dev.posts.removeAll()
        dev.webkit[KTProtocol.gapKey] = nil  // the note was lost too
        dev.relaunch()
        let answer = dev.launch(stamp: false)
        XCTAssertEqual(answer["rule"] as? Int, 6)
        XCTAssertEqual(dev.store.value("kt_sessions"), u(s1), "build 60 still follows WebKit")
        let lag = dev.store.conflicts().first { $0.key == "kt_sessions" && $0.why == "lag" }
        XCTAssertEqual(lag.flatMap { dev.store.conflictValue(id: $0.id) }, u(s2s1))
    }

    func testMissedBootStampNamedInTheGapNoteKeepsTheWitnessKnown() {
        let temp = TempDir()
        let dev = migratedDevice(temp)
        dev.failMirror = [KTProtocol.witnessKey]
        dev.set(KTProtocol.witnessKey, dev.nextStamp())  // the boot stamp's mirror got no answer
        dev.failMirror = []
        dev.posts.removeAll()
        let saved = dev.webkit
        dev.set("kt_sessions", s3s1)  // mirrored, then lost by WebKit in a hard kill
        dev.webkit = saved
        dev.relaunch()
        let answer = dev.launch(stamp: false)
        XCTAssertEqual(answer["rule"] as? Int, 6, "not rule 4: the gap note vouches for the stamp")
        let hello = dev.store.status().lastHello
        XCTAssertEqual(hello?.adopted["gap"], [KTProtocol.witnessKey.string])
        XCTAssertEqual(hello?.wouldRepair, ["kt_sessions"])
        XCTAssertEqual(dev.store.values(), dev.pageView)
    }

    func testAGapNoteDoesNotVouchForAWitnessAnOlderBuildStampedLater() {
        let temp = TempDir()
        let dev = migratedDevice(temp)
        dev.failMirror = [KTProtocol.witnessKey]
        dev.set(KTProtocol.witnessKey, dev.nextStamp())
        dev.failMirror = []
        dev.posts.removeAll()
        dev.olderBuild { $0["kt_routine"] = nil }  // 59 runs over it and stamps its own visit
        XCTAssertNotNil(dev.webkit[KTProtocol.gapKey], "an older build leaves the facade's note alone")
        dev.relaunch()
        let answer = dev.launch()
        XCTAssertEqual(answer["rule"] as? Int, 4)
        XCTAssertNil(dev.store.value("kt_routine"))
        XCTAssertEqual(reasons(dev)["kt_routine"], "older build")
    }

    // MARK: Rule 6: lag

    func testLostSuffixIsWouldRepair() throws {
        let temp = TempDir()
        let dev = migratedDevice(temp)
        let saved = dev.webkit
        dev.set("kt_sessions", s3s2s1)  // a finished workout and a departure stamp, both mirrored,
        dev.set(KTProtocol.witnessKey, dev.nextStamp())
        dev.webkit = saved  // then lost by WebKit in a hard kill right after the burst
        dev.relaunch()
        let answer = dev.launch(stamp: false)
        XCTAssertEqual(answer["rule"] as? Int, 6)
        XCTAssertEqual(answer["label"] as? String, "lag")
        let status = dev.store.status()
        XCTAssertEqual(status.lastHello?.wouldRepair, ["kt_last_open", "kt_sessions"])
        XCTAssertEqual(status.counts[.wouldRepairKeys], 2)
        XCTAssertEqual(dev.store.values(), dev.pageView, "observe mode: WebKit is followed")
        let lag = try XCTUnwrap(dev.store.conflicts().first { $0.key == "kt_sessions" })
        XCTAssertEqual(lag.why, "lag")
        XCTAssertEqual(dev.store.conflictValue(id: lag.id), u(s3s2s1), "the newer value is kept for Put back")
    }

    func testLostProgrammeEditBehindBusyDiagnosticKeysIsStillDetected() throws {
        let temp = TempDir()
        let clock = TestClock()
        let dev = migratedDevice(temp, clock: clock)
        for i in 0..<5000 {  // a busy diagnostic key, written for hours
            dev.set("kt_wch_log", "watch line \(i)")
            clock.advance(2)
        }
        let saved = dev.webkit
        dev.set("kt_routine", #"{"name":"Kalani","weeks":[{"wk":1,"bName":"Base","edited":true}]}"#)
        dev.webkit = saved  // the rarely edited programme's edit is lost
        dev.relaunch()
        let answer = dev.launch(stamp: false)
        XCTAssertEqual(answer["rule"] as? Int, 6)
        XCTAssertEqual(dev.store.status().lastHello?.wouldRepair, ["kt_routine"])
        // The busy key was pruned to its last 32 writes plus the last 10 minutes; the programme kept its history.
        let raw = try RawDB(temp.file.path)
        let busy = try raw.int("SELECT COUNT(*) FROM journal WHERE k = 'kt_wch_log'")
        XCTAssertLessThanOrEqual(busy, 32 + 301)
        XCTAssertGreaterThan(dev.store.journalHorizon, 0)
        XCTAssertGreaterThanOrEqual(try raw.int("SELECT COUNT(*) FROM journal WHERE k = 'kt_routine'"), 2)
    }

    // MARK: Rule 7

    func testUnexplainedDifferenceIsAdoptedAndKept() {
        let temp = TempDir()
        let dev = migratedDevice(temp)
        dev.webkit["kt_theme"] = u("dark")  // written behind the facade, with the witness unchanged
        dev.webkit["kt_dev_nav"] = u("coach/chat")
        dev.relaunch()
        let answer = dev.launch(stamp: false)
        XCTAssertEqual(answer["rule"] as? Int, 7)
        XCTAssertEqual(dev.store.values(), dev.pageView)
        XCTAssertEqual(reasons(dev)["kt_theme"], "unexplained")
        XCTAssertEqual(reasons(dev)["kt_dev_nav"], "unexplained")
        XCTAssertEqual(dev.store.status().counts[.unexplained], 1)
    }

    // MARK: Rules 1 and 2

    func testMinReaderAboveThisBuildAttachesNothing() throws {
        let temp = TempDir()
        let dev = migratedDevice(temp)
        dev.store.close()
        let raw = try RawDB(temp.file.path)
        try raw.exec("UPDATE meta SET v = '61' WHERE k = 'minReader'")
        try raw.exec("PRAGMA wal_checkpoint(TRUNCATE)")
        let rows = try raw.int("SELECT COUNT(*) FROM kv"), journal = try raw.int("SELECT COUNT(*) FROM journal")
        let lastShell = try raw.text("SELECT v FROM meta WHERE k = 'lastShell'")

        let store = KTStore.open(storeConfig(temp.store, build: 60))
        XCTAssertEqual(store.state, .refused(minReader: 61))
        let answer = store.answer(head: "hello", payload: KTProtocol.helloPayload(webkit: [:], gapNote: nil))
        XCTAssertEqual(answer, #"{"mode":"off","why":"minReader"}"#)
        XCTAssertEqual(store.answer(head: "w 1:1", payload: "\"kt_x\"\n\"v\""), "err")
        XCTAssertEqual(store.post(head: "w 1:1", payload: "\"kt_x\"\n\"v\""), .refused("the store is off"))
        XCTAssertEqual(store.status().state, "refused")
        XCTAssertEqual(try raw.int("SELECT COUNT(*) FROM kv"), rows, "nothing written")
        XCTAssertEqual(try raw.int("SELECT COUNT(*) FROM journal"), journal)
        XCTAssertEqual(try raw.text("SELECT v FROM meta WHERE k = 'lastShell'"), lastShell)
        store.close()

        let later = KTStore.open(storeConfig(temp.store, build: 61))
        XCTAssertEqual(later.state, .ready, "the build that raised it still reads it")
        XCTAssertEqual(later.values(), dev.pageView)
    }

    func testUnknownEncodingIsLeftUntouched() throws {
        let temp = TempDir()
        let dev = migratedDevice(temp)
        dev.store.close()
        try RawDB(temp.file.path).plantUnknownEncoding("kt_future", bytes: [1, 2, 3])
        try RawDB(temp.file.path).plantUnknownEncoding("kt_future_gone", bytes: [4, 5])
        dev.relaunch()
        dev.webkit["kt_future"] = u("WebKit's own value")  // and WebKit lacks kt_future_gone
        let answer = dev.launch(stamp: false)
        let need = (answer["need"] as? [String]) ?? []
        XCTAssertFalse(need.contains("kt_future"), "never adopted")
        dev.set("kt_future", "a page write")  // answered err: the facade notes a gap
        XCTAssertNotNil(dev.webkit[KTProtocol.gapKey])
        _ = dev.deliverPosts()
        XCTAssertEqual(dev.store.answer(head: "c \(dev.boot):\(dev.seq + 1)", payload: nil), "ok")
        let raw = try RawDB(temp.file.path)
        XCTAssertEqual(try raw.blob("SELECT v FROM kv WHERE k = 'kt_future'"), [1, 2, 3], "never repaired")
        XCTAssertEqual(try raw.blob("SELECT v FROM kv WHERE k = 'kt_future_gone'"), [4, 5], "never deleted")
        XCTAssertEqual(try raw.text("SELECT enc FROM kv WHERE k = 'kt_future'"), "z16")
        XCTAssertEqual(dev.store.status().unknownEnc, 2)
        XCTAssertNil(dev.store.value("kt_future"))
        let snap = try dev.store.writeSnap(kind: "manual")
        XCTAssertNil(try dev.store.readSnap(snap.name)["kt_future"])
    }

    func testWebKitUnreadableReconcilesNothing() {
        let temp = TempDir()
        let dev = migratedDevice(temp)
        let before = dev.store.values()
        XCTAssertEqual(dev.store.answer(head: "hello nowk", payload: nil), #"{"mode":"off","why":"nowk"}"#)
        XCTAssertEqual(dev.store.values(), before, "never read as empty")
        XCTAssertEqual(dev.store.status().lastHello?.rule, 2)
        XCTAssertEqual(dev.store.answer(head: "hello", payload: "not a payload"), #"{"mode":"off","why":"bad hello"}"#)
        XCTAssertEqual(dev.store.values(), before)
    }

    func testWkExcludedKeysAreNeverAdoptedRepairedOrCounted() throws {
        let temp = TempDir()
        let dev = migratedDevice(temp)
        dev.set("kt_pre_restore", "a restore's undo copy")
        dev.store.close()
        try RawDB(temp.file.path).exec(#"UPDATE meta SET v = '["kt_pre_restore","kt_cards"]' WHERE k = 'wkExcluded'"#)
        dev.relaunch()
        dev.webkit["kt_pre_restore"] = nil  // absent from WebKit on purpose
        dev.webkit["kt_cards"] = u("WebKit's copy")
        let answer = dev.launch(stamp: false)
        XCTAssertEqual(answer["rule"] as? Int, 0, "excluded keys are not counted")
        XCTAssertEqual(dev.store.value("kt_pre_restore"), u("a restore's undo copy"), "not tombstoned")
        XCTAssertNil(dev.store.value("kt_cards"), "not adopted")
    }

    /// A document start the store cannot write (a full disk) leaves the facade off for that document: the hello
    /// answers off when its own adoption cannot be written, and a put answered `full` attaches nothing. Either
    /// way the page's boot stamp reaches WebKit alone, the next start adopts everything as after an older
    /// build, and nothing is lost.
    func testADocumentStartOnAFullDiskLeavesTheFacadeOffAndTheNextStartAdoptsEverything() throws {
        for deletes in [false, true] {
            let temp = TempDir()
            let dev = migratedDevice(temp)
            dev.olderBuild { wk in
                wk["kt_routine"] = u(#"{"name":"from 59","weeks":[]}"# + String(repeating: " ", count: 20_000))
                if deletes { wk["kt_coach_msgs"] = nil }  // a tombstone and a conflict: hello's own writes
            }
            try dev.store.withConnection { s in
                let pages = try s.scalarInt("PRAGMA page_count") ?? 0
                _ = try s.scalarInt("PRAGMA max_page_count = \(pages)")
            }
            let answer = dev.launch()
            if deletes {
                XCTAssertEqual(answer["mode"] as? String, "off", "hello could not write its adoption")
                XCTAssertTrue((answer["why"] as? String ?? "").hasPrefix("full"), "\(answer)")
            } else {
                XCTAssertEqual(answer["mode"] as? String, "shadow")
                XCTAssertFalse(dev.attached, "the put was answered full: nothing attached")
            }
            XCTAssertEqual(dev.store.status().counts[.full], 1, "deletes \(deletes)")
            XCTAssertEqual(dev.store.state, .ready, "a full disk is not damage")
            XCTAssertNotNil(dev.store.value("kt_coach_msgs"), "nothing half adopted")
            dev.set("kt_theme", "dark")  // the page runs on WebKit alone
            XCTAssertEqual(dev.store.value("kt_theme"), u("heavyweight"))

            dev.relaunch()  // room again
            let next = dev.launch()
            XCTAssertEqual(next["rule"] as? Int, 4, "deletes \(deletes)")
            XCTAssertEqual(next["label"] as? String, "older build")
            XCTAssertEqual(dev.store.values(), dev.pageView)
            XCTAssertEqual(reasons(dev)["kt_routine"], "older build")
            XCTAssertEqual(dev.launch()["rule"] as? Int, 0)
        }
    }

    func testAsyncPostOfAFailedMirrorLandsAndTheNextLaunchIsInStep() {
        let temp = TempDir()
        let dev = migratedDevice(temp)
        dev.failMirror = ["kt_bw"]
        dev.set("kt_bw", #"[{"id":5,"date":"2026-10-09","lb":179}]"#)
        dev.failMirror = []
        XCTAssertNotNil(dev.webkit[KTProtocol.gapKey])
        XCTAssertEqual(dev.deliverPosts(), [.applied])
        XCTAssertEqual(dev.store.value("kt_bw"), dev.webkit["kt_bw"])
        XCTAssertEqual(dev.launch()["rule"] as? Int, 0, "the post landed: the gap note names a key already in step")
        XCTAssertNil(dev.webkit[KTProtocol.gapKey], "and the facade drops the note")
    }

    // MARK: The prototype's mactest

    /// The prototype's mactest checks that still apply to build 60, in its order (native-store-first/mactest).
    /// Its native-mode checks wait for the flip, and its "WebKit missing a core key: refilled" check is the
    /// fault decision.md removed: here such a key's deletion is adopted.
    func testMactestChecksThatStillApply() {
        // 3. Shadow mode: WebKit in charge.
        let temp = TempDir()
        let dev = FakeDevice(temp)
        dev.webkit = ["kt_a": u("1"), "kt_b": u("B"), "kt_last_open": u("1000")]
        var answer = dev.launch(stamp: false)
        XCTAssertEqual(Set((answer["need"] as? [String]) ?? []), ["kt_a", "kt_b", "kt_last_open"], "first launch: need all")
        dev.set("kt_a", "2")  // WebKit takes it first, then the mirror
        XCTAssertEqual(dev.launch()["rule"] as? Int, 0, "in step")
        let saved = dev.webkit
        dev.set("kt_a", "3")
        dev.webkit = saved  // WebKit lost it in a hard kill
        answer = dev.launch(stamp: false)
        XCTAssertEqual(dev.store.value("kt_a"), u("2"), "WebKit lost a write: the store still follows WebKit")
        XCTAssertEqual(answer["rule"] as? Int, 6)
        XCTAssertEqual(dev.store.status().counts[.wouldRepairKeys], 1, "counted as WebKit-behind evidence")
        XCTAssertNil(answer["rewrite"], "shadow never asks the page to rewrite WebKit")
        dev.olderBuild { $0["kt_b"] = nil }
        dev.launch()
        XCTAssertNil(dev.store.value("kt_b"), "a WebKit deletion is followed")
        dev.webkit["kt_dev_nav"] = u("coach/chat")  // a tool writes WebKit's file directly (test-native.sh)
        dev.launch()
        XCTAssertEqual(dev.store.value("kt_dev_nav"), u("coach/chat"), "a key a tool wrote into WebKit's file is adopted")
        XCTAssertEqual(dev.store.values(), dev.pageView)

        // 2b. WebKit's copy lost or unreadable: never read as deletions.
        let temp2 = TempDir()
        let dev2 = FakeDevice(temp2)
        dev2.webkit = ["kt_sessions": u("[1]"), "kt_routine": u("{}"), "kt_x": u("1"), "kt_y": u("2"), "kt_z": u("3"),
                       "kt_last_open": u("2000")]
        dev2.launch(stamp: false)
        let full = dev2.store.values()
        XCTAssertEqual(dev2.store.answer(head: "hello nowk", payload: nil), #"{"mode":"off","why":"nowk"}"#,
                       "hello nowk: off, the page runs as today")
        XCTAssertEqual(dev2.store.values(), full)
        let empty = dev2.store.answer(head: "hello", payload: KTProtocol.helloPayload(webkit: [:], gapNote: nil))
        XCTAssertEqual(empty, #"{"mode":"off","why":"wiped"}"#, "an empty WebKit manifest deletes nothing")
        XCTAssertEqual(dev2.store.values(), full)
        dev2.olderBuild { $0["kt_x"] = nil; $0["kt_sessions"] = nil }  // an older build deleted them
        dev2.launch()
        XCTAssertNil(dev2.store.value("kt_x"), "an ordinary key's deletion is adopted")
        XCTAssertNil(dev2.store.value("kt_sessions"), "and so is a core key's: nothing is refilled")
        XCTAssertNil(dev2.webkit["kt_sessions"])
    }

    // MARK: The classifier on its own (the judge's model, scenarios A-G)

    /// Store writes as the judge's model makes them: kv plus journal rows {seq, k, h, hprev}, each with the page's
    /// (boot, seq) for the write (1:0 unless a test says, as for a migration).
    struct Model {
        var kv: [KTKey: String] = [:]
        var stamps: [KTKey: KTProtocol.BootSeq] = [:]
        var journal: [KTJournalRow] = []

        mutating func w(_ k: KTKey, _ v: String?, _ boot: Int64 = 1, _ seq: Int64 = 0) {
            let h = KTWire.hash(v.map(u))
            journal.append(KTJournalRow(seq: Int64(journal.count + 1), key: k, h: h, hprev: kv[k] ?? KTWire.absent,
                                        boot: boot, pseq: seq))
            kv[k] = h
            stamps[k] = KTProtocol.BootSeq(boot: boot, seq: seq)
        }

        func input(_ webkit: [KTKey: String], gap: [KTKey: String]? = nil) -> KTReconcileInput {
            var witness = Set(journal.filter { $0.key == KTProtocol.witnessKey }.flatMap { [$0.h, $0.hprev] })
            if let h = kv[KTProtocol.witnessKey] { witness.insert(h) }
            witness.remove(KTWire.absent)
            return KTReconcileInput(manifest: webkit, gap: gap.map { KTProtocol.GapNote(keys: $0) }, store: kv,
                                    storeStamps: stamps, witnessHistory: witness, journal: journal)
        }

        static func base() -> (Model, [KTKey: String]) {
            var m = Model()
            m.w("kt_last_open", "1000"); m.w("kt_routine", "R1"); m.w("kt_coach_msgs", "C1")
            m.w("kt_sessions", "[s1]"); m.w("kt_weights", "W1"); m.w("kt_bw", "B1")
            return (m, m.kv)
        }
    }

    func testJudgesModelScenarios() {
        let h = { (s: String) in KTWire.hash(u(s)) }
        // A: true lag: WebKit lost the last two writes.
        var (m, W) = Model.base()
        m.w("kt_sessions", "[s2,s1]"); m.w("kt_last_open", "1100")
        var plan = KTReconcile.classify(m.input(W))
        XCTAssertEqual(plan.rule, 6)
        XCTAssertEqual(plan.wouldRepair, ["kt_last_open", "kt_sessions"])
        XCTAssertEqual(plan.lagSeq, 6)

        // B: 59 reset the programme and cleared the chat, and stamped a visit.
        (m, W) = Model.base()
        W["kt_routine"] = nil; W["kt_coach_msgs"] = nil; W["kt_last_open"] = h("2000")
        plan = KTReconcile.classify(m.input(W))
        XCTAssertEqual(plan.rule, 4)
        XCTAssertEqual(plan.changes["kt_routine"], KTChange(target: "-", reason: .olderBuild))
        XCTAssertEqual(plan.changes["kt_coach_msgs"], KTChange(target: "-", reason: .olderBuild))
        XCTAssertEqual(plan.need, ["kt_last_open"])

        // C: missed mirror ABA, gap note names the key.
        (m, _) = Model.base()
        m.w("kt_sessions", "[s2,s1]"); m.w("kt_sessions", "[s1]"); m.w("kt_sessions", "[s2,s1]")
        W = m.kv
        W["kt_sessions"] = h("[s1]")
        plan = KTReconcile.classify(m.input(W, gap: ["kt_sessions": h("[s1]")]))
        XCTAssertEqual(plan.rule, 5)
        XCTAssertEqual(plan.changes, ["kt_sessions": KTChange(target: h("[s1]"), reason: .gap)])

        // D: the same with the gap note lost: reads as lag (the documented residual).
        plan = KTReconcile.classify(m.input(W))
        XCTAssertEqual(plan.rule, 6)
        XCTAssertEqual(plan.lagSeq, 8)

        // E: the boot stamp's mirror was missed (named in the gap note) and WebKit lost a later session write.
        (m, W) = Model.base()
        W["kt_last_open"] = h("1200")
        m.w("kt_sessions", "[s3,s1]")
        plan = KTReconcile.classify(m.input(W, gap: ["kt_last_open": h("1200")]))
        XCTAssertEqual(plan.rule, 6)
        XCTAssertEqual(plan.changes["kt_last_open"]?.reason, .gap)
        XCTAssertEqual(plan.wouldRepair, ["kt_sessions"])
        XCTAssertEqual(plan.lagSeq, 6)

        // F: WebKit wiped.
        (m, _) = Model.base()
        plan = KTReconcile.classify(m.input([:]))
        XCTAssertEqual(plan.rule, 3)
        XCTAssertFalse(plan.attach)
        XCTAssertTrue(plan.changes.isEmpty)

        // G: a programme edit lost behind 5,000 diagnostic writes.
        (m, _) = Model.base()
        for i in 0..<5000 { m.w("kt_wch_log", "L\(i)") }
        W = m.kv
        m.w("kt_routine", "R2")
        plan = KTReconcile.classify(m.input(W))
        XCTAssertEqual(plan.rule, 6)
        XCTAssertEqual(plan.wouldRepair, ["kt_routine"])
        XCTAssertEqual(plan.lagSeq, 5006)
    }

    func testClassifierEdges() {
        let h = { (s: String) in KTWire.hash(u(s)) }
        var (m, W) = Model.base()
        // In step, reserved keys and the API key aside.
        W["kt_apikey"] = h("sk-ant"); W["kt__store_gap"] = h("{}")
        XCTAssertEqual(KTReconcile.classify(m.input(W)).rule, 0)

        // An empty store is a migration; an absent witness never vouches.
        let empty = KTReconcile.classify(KTReconcileInput(manifest: W, store: [:]))
        XCTAssertEqual(empty.label, "migrate")
        XCTAssertTrue(empty.changes.values.allSatisfy { $0.reason == .migrate })
        XCTAssertFalse(empty.changes.keys.contains("kt_apikey"))
        var noWitness = W
        noWitness["kt_last_open"] = nil
        XCTAssertEqual(KTReconcile.classify(m.input(noWitness)).rule, 4, "not near-empty, so not rule 3")

        // Rule 3 needs a full set in the store.
        var small = Model()
        small.w("kt_theme", "dark")
        XCTAssertEqual(KTReconcile.classify(small.input([:])).rule, 4)

        // A key WebKit holds that the store never had cannot be lag.
        (m, W) = Model.base()
        W["kt_new"] = h("x")
        XCTAssertEqual(KTReconcile.classify(m.input(W)).rule, 7)

        // A gap note with all:true names every key.
        W["kt_routine"] = nil
        var input = m.input(W)
        input.gap = KTProtocol.GapNote(keys: [:], all: true)
        let all = KTReconcile.classify(input)
        XCTAssertEqual(all.rule, 5)
        XCTAssertEqual(Set(all.changes.keys), ["kt_new", "kt_routine"])

        // While a wipe's follow-up is pending, a value equal to the one the wipe kept is labelled "wiped".
        (m, W) = Model.base()
        W["kt_routine"] = nil
        W["kt_last_open"] = h("9999")
        input = m.input(W)
        input.wipe = ["kt_routine": h("R1")]
        XCTAssertEqual(KTReconcile.classify(input).changes["kt_routine"]?.reason, .wiped)

        // A Put back WebKit took without confirming is recognised, not counted as unexplained.
        (m, W) = Model.base()
        W["kt_routine"] = h("R0")
        input = m.input(W)
        input.putBack = ["kt_routine": (h("R0"), h("R1"))]
        let landed = KTReconcile.classify(input)
        XCTAssertEqual(landed.rule, 0)
        XCTAssertEqual(landed.changes["kt_routine"]?.reason, .putback)
    }

    /// A gap note entry older than the store's last write of that key does not explain the difference: WebKit
    /// lost the later write, so the key is not adopted as a gap (rule 5) and the store's value is not given up.
    func testGapNoteOlderThanTheStoresLastWriteIsNotAGap() {
        let k: KTKey = "kt_sessions"
        let old = KTWire.hash(Array(s1.utf16)), new = KTWire.hash(Array(s2s1.utf16))
        var note = KTProtocol.GapNote(keys: [k: old], stamps: [k: KTProtocol.BootSeq(boot: 3, seq: 4)])
        note.at = 1
        let back = KTProtocol.GapNote.parse(note.json())
        XCTAssertEqual(back, note)
        let stale = KTReconcileInput(manifest: [k: old, KTProtocol.witnessKey: "w"], gap: note,
                                     store: [k: new, KTProtocol.witnessKey: "w"],
                                     storeStamps: [k: KTProtocol.BootSeq(boot: 3, seq: 9)], witnessHistory: ["w"])
        XCTAssertNotEqual(KTReconcile.classify(stale).changes[k]?.reason, .gap)
        let fresh = KTReconcileInput(manifest: [k: old, KTProtocol.witnessKey: "w"], gap: note,
                                     store: [k: new, KTProtocol.witnessKey: "w"],
                                     storeStamps: [k: KTProtocol.BootSeq(boot: 3, seq: 2)], witnessHistory: ["w"])
        XCTAssertEqual(KTReconcile.classify(fresh).changes[k]?.reason, .gap)
    }

    // MARK: Rule 5 and a clear the store missed

    /// `localStorage.clear()` whose mirror got no answer, then two writes the store took, then a hard kill that
    /// loses the last of them in WebKit. The note's `all` explains the keys the clear removed (the store took no
    /// write of them after it), but not the programme the store wrote after the clear: that is a lost suffix,
    /// would-repair, and the newer value is kept for Put back.
    func testFailedClearThenALostSuffixIsWouldRepair() throws {
        let temp = TempDir()
        let dev = migratedDevice(temp)
        dev.failClear = true
        dev.clear()
        dev.failClear = false
        dev.posts.removeAll()  // the clear's async post never arrived
        XCTAssertNotNil(dev.webkit[KTProtocol.gapKey], "the facade noted the missed clear")
        dev.set(KTProtocol.witnessKey, dev.nextStamp())  // the page stamps a visit after the clear (mirrored)
        let r1 = #"{"name":"after the clear","weeks":[{"wk":1}]}"#
        let r2 = #"{"name":"after the clear","weeks":[{"wk":1},{"wk":2}]}"#
        dev.set("kt_routine", r1)
        let saved = dev.webkit
        dev.set("kt_routine", r2)
        dev.webkit = saved  // WebKit loses the last write in a hard kill
        dev.relaunch()
        let answer = dev.launch(stamp: false)
        XCTAssertEqual(answer["rule"] as? Int, 6, "\(answer)")
        XCTAssertEqual(answer["label"] as? String, "lag")
        let hello = try XCTUnwrap(dev.store.status().lastHello)
        XCTAssertEqual(hello.wouldRepair, ["kt_routine"])
        XCTAssertEqual(hello.adopted["lag"], ["kt_routine"])
        let lag = try XCTUnwrap(dev.store.conflicts().first { $0.key == "kt_routine" })
        XCTAssertEqual(lag.why, "lag")
        XCTAssertEqual(dev.store.conflictValue(id: lag.id), u(r2), "the newer value is kept for Put back")
        XCTAssertEqual(dev.store.previewPutBack(conflicts: [lag.id]).items.map(\.outcome), [.putBack])
        // What the clear removed is explained by the note: followed, and nothing of it kept.
        let cleared = Set(Seed.values.keys).subtracting(["kt_apikey", "kt_routine", KTProtocol.witnessKey])
        XCTAssertEqual(Set((hello.adopted["gap"] ?? []).map { KTKey($0) }), cleared)
        XCTAssertEqual(dev.store.conflicts().map(\.key), ["kt_routine"])
        XCTAssertNil(dev.store.value("kt_sessions"))
        XCTAssertEqual(dev.store.values(), dev.pageView, "observe mode: WebKit is followed")
        XCTAssertNil(dev.webkit[KTProtocol.gapKey], "the facade drops the note once adopted")
        XCTAssertEqual(dev.launch()["rule"] as? Int, 0)
    }

    /// The same with the lost write the first one after the clear for a key the clear had removed: WebKit holds
    /// nothing for it (the clear's doing), while the store's row for that write follows the value from before the
    /// clear. The walk reads WebKit's side from the clear on, so this lost suffix is would-repair too.
    func testFailedClearThenLostFirstWritesAfterItAreWouldRepair() throws {
        let temp = TempDir()
        let dev = migratedDevice(temp)
        dev.failClear = true
        dev.clear()
        dev.failClear = false
        dev.posts.removeAll()
        dev.set(KTProtocol.witnessKey, dev.nextStamp())
        dev.set("kt_routine", #"{"name":"after the clear","weeks":[]}"#)
        let saved = dev.webkit
        dev.set("kt_sessions", s1)  // the first workout logged after the clear
        dev.set("kt_weights", #"{"Bench":95}"#)
        dev.webkit = saved  // lost in a hard kill
        dev.relaunch()
        let answer = dev.launch(stamp: false)
        XCTAssertEqual(answer["rule"] as? Int, 6, "\(answer)")
        let hello = try XCTUnwrap(dev.store.status().lastHello)
        XCTAssertEqual(hello.wouldRepair, ["kt_sessions", "kt_weights"])
        let lag = dev.store.conflicts().filter { $0.why == "lag" }
        XCTAssertEqual(Set(lag.map(\.key)), ["kt_sessions", "kt_weights"])
        let sessions = try XCTUnwrap(lag.first { $0.key == "kt_sessions" })
        XCTAssertEqual(dev.store.conflictValue(id: sessions.id), u(s1), "the lost workout is kept for Put back")
        XCTAssertEqual(dev.store.values(), dev.pageView)
        XCTAssertEqual(dev.launch()["rule"] as? Int, 0)
    }

    /// The missed clear alone: every key it removed is a gap (followed, nothing kept), and a write after it that the
    /// store missed too is explained by its own entry in the note.
    func testFailedClearAloneIsAGap() throws {
        let temp = TempDir()
        let dev = migratedDevice(temp)
        dev.failClear = true
        dev.clear()
        dev.failClear = false
        dev.set(KTProtocol.witnessKey, dev.nextStamp())
        dev.failMirror = ["kt_theme"]
        dev.set("kt_theme", "dark")  // missed as well: merged into the clear's note
        dev.failMirror = []
        dev.posts.removeAll()
        let note = try XCTUnwrap(dev.webkit[KTProtocol.gapKey].flatMap { KTProtocol.GapNote.parse($0) })
        XCTAssertTrue(note.all)
        XCTAssertNotNil(note.stamps["kt_theme"])
        let kept = dev.store.conflicts().count
        dev.relaunch()
        let answer = dev.launch(stamp: false)
        XCTAssertEqual(answer["rule"] as? Int, 5, "\(answer)")
        XCTAssertEqual(dev.store.conflicts().count, kept, "a missed clear's removed values are not offered back")
        XCTAssertEqual(dev.store.values(), dev.pageView)
        XCTAssertEqual(dev.store.value("kt_theme"), u("dark"))
        XCTAssertEqual(dev.launch()["rule"] as? Int, 0)
    }

    /// The clear's async post lands after all: the store tombstones what it held from before the clear, keeps
    /// the writes it took after it, and the next document start is in step.
    func testFailedClearWhosePostLandsIsInStep() {
        let temp = TempDir()
        let dev = migratedDevice(temp)
        dev.failClear = true
        dev.clear()
        dev.failClear = false
        dev.set(KTProtocol.witnessKey, dev.nextStamp())
        dev.set("kt_theme", "dark")
        XCTAssertEqual(dev.deliverPosts(), [.applied])
        XCTAssertEqual(dev.store.values(), dev.pageView)
        XCTAssertEqual(dev.launch()["rule"] as? Int, 0, "the note names nothing the store does not hold")
        XCTAssertNil(dev.webkit[KTProtocol.gapKey])
    }

    /// The probe at classifier level: after a clear the store missed (stamp 2:1), it took the witness (2:2) and
    /// the programme twice (2:3, 2:4), and WebKit holds the first of those programme writes. The clear's stamp
    /// tells the store's later write from what the clear removed.
    func testAClearGapNoteExplainsOnlyKeysTheStoreDidNotWriteAfterIt() throws {
        let h = { (s: String) in KTWire.hash(u(s)) }
        var (m, _) = Model.base()  // seq 1-6, all written at boot 1
        m.w("kt_last_open", "1100", 2, 2)  // seq 7
        m.w("kt_routine", "r1", 2, 3)  // seq 8
        m.w("kt_routine", "r2", 2, 4)  // seq 9
        let W: [KTKey: String] = ["kt_last_open": h("1100"), "kt_routine": h("r1")]
        var input = m.input(W)
        input.gap = KTProtocol.GapNote.parse(u(#"{"v":1,"at":7,"k":{},"all":true,"c":"2:1"}"#))
        var plan = KTReconcile.classify(input)
        XCTAssertEqual(plan.rule, 6)
        XCTAssertEqual(plan.wouldRepair, ["kt_routine"])
        XCTAssertEqual(plan.lagSeq, 8)
        var expected: [KTKey: KTChange] = ["kt_routine": KTChange(target: h("r1"), reason: .lag)]
        for k: KTKey in ["kt_coach_msgs", "kt_sessions", "kt_weights", "kt_bw"] {
            expected[k] = KTChange(target: KTWire.absent, reason: .gap)
        }
        XCTAssertEqual(plan.changes, expected)

        // The store's programme from before the clear, and WebKit's from a write after it the store missed too
        // (its own entry in the note): explained, a gap.
        (m, _) = Model.base()
        input = m.input(["kt_last_open": h("1000"), "kt_routine": h("r1")])
        input.gap = KTProtocol.GapNote.parse(
            u(#"{"v":1,"at":7,"k":{"kt_routine":""# + h("r1") + #""},"s":{"kt_routine":"2:3"},"all":true,"c":"2:1"}"#))
        plan = KTReconcile.classify(input)
        XCTAssertEqual(plan.rule, 5)
        XCTAssertEqual(plan.changes["kt_routine"], KTChange(target: h("r1"), reason: .gap))
        XCTAssertEqual(plan.changes.count, 5)
    }

    /// The lag walk reads a key the note names but does not explain from its last missed op on: rows at or before
    /// that op say nothing about WebKit now, and undoing the key's first row after it leaves what WebKit held after
    /// the op (the note's hash; nothing, for a clear), not the store's older value.
    func testLagWalkReadsAKeyFromItsLastMissedOp() {
        let h = { (s: String) in KTWire.hash(u(s)) }
        // The store missed a workout (2:1, the note's entry), then took a weights change (2:2) and the next workout
        // (2:3), both of which WebKit lost.
        var (m, W) = Model.base()  // seq 1-6
        m.w("kt_weights", "W2", 2, 2)  // seq 7
        m.w("kt_sessions", "[s3,s2,s1]", 2, 3)  // seq 8: hprev is [s1], the store never had [s2,s1]
        W["kt_sessions"] = h("[s2,s1]")
        var input = m.input(W)
        input.gap = KTProtocol.GapNote(keys: ["kt_sessions": h("[s2,s1]")],
                                       stamps: ["kt_sessions": KTProtocol.BootSeq(boot: 2, seq: 1)])
        var plan = KTReconcile.classify(input)
        XCTAssertEqual(plan.rule, 6)
        XCTAssertEqual(plan.wouldRepair, ["kt_sessions", "kt_weights"])
        XCTAssertEqual(plan.lagSeq, 6)
        XCTAssertEqual(plan.changes["kt_sessions"], KTChange(target: h("[s2,s1]"), reason: .lag))

        // WebKit holding neither what the missed op left nor any later state is no lag.
        W["kt_sessions"] = h("[s9]")
        input.manifest = W
        plan = KTReconcile.classify(input)
        XCTAssertEqual(plan.rule, 7)

        // A missed clear (2:1): the store then took the witness (2:2) and a first workout (2:3), and WebKit lost the
        // workout. WebKit's side of the walk starts empty at the clear.
        (m, _) = Model.base()
        m.w("kt_last_open", "1100", 2, 2)  // seq 7
        m.w("kt_sessions", "[s4]", 2, 3)  // seq 8: hprev is [s1], from before the clear
        input = m.input(["kt_last_open": h("1100")])
        input.gap = KTProtocol.GapNote(keys: [:], all: true, clear: KTProtocol.BootSeq(boot: 2, seq: 1))
        plan = KTReconcile.classify(input)
        XCTAssertEqual(plan.rule, 6)
        XCTAssertEqual(plan.wouldRepair, ["kt_sessions"])
        XCTAssertEqual(plan.lagSeq, 7)
        XCTAssertEqual(plan.changes["kt_sessions"], KTChange(target: KTWire.absent, reason: .lag))
        XCTAssertEqual(plan.changes["kt_routine"], KTChange(target: KTWire.absent, reason: .gap))
    }
}
