import Foundation

extension AppStore {
    func saveAssignment(id: String, relationshipID: String, workout: Workout, date: Date, time: String,
                        format: TrainingFormat, original: Assignment? = nil, repeatedFrom: String? = nil) async throws {
        try requireTrainer()
        if let message = ReppyValidation.workout(workout) { throw APIError.message(message) }
        guard data.relationships.contains(where: { $0.id == relationshipID }) else { throw APIError.message("Выбери ученика.") }
        var values: [String: Any] = ["relationship_id": relationshipID, "scheduled_for": ReppyDate.day(date),
            "scheduled_time": format == .inPerson ? time : NSNull(), "format": format.rawValue,
            "timezone": TimeZone.current.identifier, "workout_snapshot": try jsonObject(workout),
            "repeated_from_assignment_id": nullable(repeatedFrom ?? original?.repeated_from_assignment_id),
            "reschedule_scheduled_for": NSNull(), "reschedule_scheduled_time": NSNull(), "reschedule_requested_at": NSNull()]
        if isDemo {
            values["id"] = id; values["assigned_at"] = original?.assigned_at ?? ReppyDate.timestamp()
            values["status"] = original?.status ?? "assigned"; values["revision"] = (original?.revision ?? 0) + 1
            let assignment: Assignment = try decodeObject(values)
            data.assignments.removeAll { $0.id == id }; data.assignments.append(assignment); return
        }
        guard let api else { throw APIError.signedOut }
        if let original {
            let row: Assignment = try await api.update("assignments", id: id, revision: original.revision, values: values)
            data.assignments.removeAll { $0.id == id }; data.assignments.append(row)
        } else {
            values["id"] = id
            try await api.insert("assignments", values); try await loadData()
        }
    }
    func deleteAssignment(_ assignment: Assignment) async throws {
        try requireTrainer()
        if !isDemo, let api {
            if let session = data.session(for: assignment.id) { try await api.call("archive_workout_session", ["p_session_id": session.id]) }
            else { _ = try await api.request("rest/v1/assignments", method: "DELETE", query: ["id": "eq.\(assignment.id)"]) }
        }
        if let session = data.session(for: assignment.id) {
            if isDemo, session.charge_status == "charged", !data.subscriptions.contains(where: { $0.session_id == session.id && $0.kind == "session-refund" }) {
                data.subscriptions.append(try decodeObject(["id": UUID().uuidString.lowercased(), "relationship_id": assignment.relationship_id,
                    "kind": "session-refund", "lesson_delta": 1, "occurred_at": ReppyDate.timestamp(), "created_at": ReppyDate.timestamp(),
                    "session_id": session.id, "workout_name": session.workout_snapshot.name, "revision": 1]))
            }
            data.sessions.removeAll { $0.id == session.id }; data.results.removeAll { $0.session_id == session.id }
        }
        data.assignments.removeAll { $0.id == assignment.id }
        if !isDemo { try await loadData() }
    }
    func requestReschedule(_ assignment: Assignment, date: Date, time: String) async throws {
        guard assignment.format == .inPerson, assignment.status == "assigned" else { throw APIError.message("Перенос для этой тренировки недоступен.") }
        if isDemo {
            guard let index = data.assignments.firstIndex(where: { $0.id == assignment.id }) else { return }
            data.assignments[index].reschedule_scheduled_for = ReppyDate.day(date)
            data.assignments[index].reschedule_scheduled_time = time
            data.assignments[index].reschedule_requested_at = ReppyDate.timestamp(); return
        }
        guard let api else { throw APIError.signedOut }
        let row: Assignment = try await api.rpc("request_assignment_reschedule", ["p_assignment_id": assignment.id, "p_scheduled_for": ReppyDate.day(date), "p_scheduled_time": time])
        data.assignments.removeAll { $0.id == row.id }; data.assignments.append(row)
    }
    func decideReschedule(_ assignment: Assignment, accept: Bool) async throws {
        try requireTrainer()
        var changed = assignment
        if accept { changed.scheduled_for = assignment.reschedule_scheduled_for ?? assignment.scheduled_for; changed.scheduled_time = assignment.reschedule_scheduled_time }
        let values: [String: Any] = ["scheduled_for": changed.scheduled_for, "scheduled_time": nullable(changed.scheduled_time),
            "reschedule_scheduled_for": NSNull(), "reschedule_scheduled_time": NSNull(), "reschedule_requested_at": NSNull()]
        if !isDemo, let api { changed = try await api.update("assignments", id: assignment.id, revision: assignment.revision, values: values) }
        else { changed.reschedule_requested_at = nil; changed.reschedule_scheduled_for = nil; changed.reschedule_scheduled_time = nil; changed.revision += 1 }
        data.assignments.removeAll { $0.id == changed.id }; data.assignments.append(changed)
    }
    func startSession(_ assignment: Assignment) async throws -> String {
        if let existing = data.session(for: assignment.id) { return existing.id }
        guard assignment.canStart(as: profile?.role ?? .student, sessions: data.sessions) else { throw APIError.message("Очная тренировка будет доступна в назначенный день.") }
        let key = "session-start:\(assignment.id)"
        let id: String = try DraftStorage.load(account: accountKey, key: key) ?? UUID().uuidString.lowercased()
        try DraftStorage.save(id, account: accountKey, key: key)
        let session: WorkoutSession
        if isDemo {
            session = try decodeObject(["id": id, "assignment_id": assignment.id, "workout_snapshot": try jsonObject(assignment.workout_snapshot),
                "recorded_by_role": profile!.role.rawValue, "started_at": ReppyDate.timestamp(), "revision": 1])
        } else {
            guard let api else { throw APIError.signedOut }
            session = try await api.rpc("start_workout_session_with_id", ["p_assignment_id": assignment.id, "p_session_id": id])
        }
        data.sessions.removeAll { $0.id == session.id }; data.sessions.append(session)
        let results = WorkoutExecution.initialResults(sessionID: session.id, workout: session.workout_snapshot)
        try await saveProgress(session, workout: session.workout_snapshot, results: results)
        try DraftStorage.remove(account: accountKey, key: key)
        return session.id
    }
    func saveProgress(_ session: WorkoutSession, workout: Workout, results: [SetResult]) async throws {
        guard session.completed_at == nil else { throw APIError.message("Завершённая тренировка доступна только для просмотра.") }
        if let message = ReppyValidation.workout(workout) { throw APIError.message(message) }
        guard WorkoutExecution.validate(sessionID: session.id, workout: workout, results: results) else { throw APIError.message("Проверь фактические значения подходов.") }
        var saved = session; saved.workout_snapshot = workout
        if !isDemo, let api {
            let payload: [[String: Any]] = results.map { ["exerciseInstanceId": $0.exercise_instance_id, "setNumber": $0.set_number,
                "actualReps": $0.actual_reps, "actualWeight": $0.actual_weight, "completed": $0.completed] }
            do {
                saved = try await api.rpc("save_session_progress", ["p_session_id": session.id, "p_expected_revision": session.revision,
                    "p_workout_snapshot": try jsonObject(workout), "p_results": payload])
            } catch APIError.conflict {
                let rows: [WorkoutSession] = try await api.rows("workout_sessions", query: ["id": "eq.\(session.id)"])
                let stored: [SetResult] = try await api.rows("set_results", query: ["session_id": "eq.\(session.id)"])
                guard let remote = rows.first, remote.completed_at == nil, remote.workout_snapshot == workout,
                    stored.sorted(by: { $0.id < $1.id }) == results.sorted(by: { $0.id < $1.id }) else { throw APIError.conflict }
                saved = remote
            }
        } else { saved.revision += 1 }
        data.sessions.removeAll { $0.id == session.id }; data.sessions.append(saved)
        data.results.removeAll { $0.session_id == session.id }; data.results += results
    }
    func completeSession(_ session: WorkoutSession, charge: Bool) async throws {
        if session.completed_at != nil { return }
        var saved = session
        if !isDemo, let api { saved = try await api.rpc("complete_workout_session", ["p_session_id": session.id, "p_charge_subscription": isTrainer ? charge : true]) }
        else {
            saved.completed_at = ReppyDate.timestamp(); saved.charge_status = (isTrainer ? charge : true) ? "charged" : "waived"; saved.revision += 1
            if let assignment = data.assignments.first(where: { $0.id == session.assignment_id }), saved.charge_status == "charged",
               !data.subscriptions.contains(where: { $0.kind == "session-charge" && $0.session_id == session.id }) {
                data.subscriptions.append(try decodeObject(["id": UUID().uuidString.lowercased(), "relationship_id": assignment.relationship_id,
                    "kind": "session-charge", "lesson_delta": -1, "occurred_at": saved.completed_at!, "created_at": saved.completed_at!,
                    "session_id": session.id, "workout_name": session.workout_snapshot.name, "revision": 1]))
            }
        }
        data.sessions.removeAll { $0.id == saved.id }; data.sessions.append(saved)
        if let index = data.assignments.firstIndex(where: { $0.id == session.assignment_id }) { data.assignments[index].status = "completed" }
        if !isDemo { try await loadData() }
    }
    func saveFeedback(_ session: WorkoutSession, mood: Mood, comment: String) async throws {
        if !isDemo, let api { try await api.call("save_session_feedback", ["p_session_id": session.id, "p_mood": mood.rawValue, "p_comment": comment.trimmingCharacters(in: .whitespacesAndNewlines)]) }
        if let index = data.sessions.firstIndex(where: { $0.id == session.id }) { data.sessions[index].mood = mood; data.sessions[index].comment = comment }
    }
    func saveStudent(_ student: Student) async throws {
        if let error = ReppyValidation.student(student) { throw APIError.message(error) }
        var saved = student
        if !isDemo, let api {
            let values: [String: Any] = ["name": student.name.trimmingCharacters(in: .whitespacesAndNewlines), "phone": nullable(student.phone),
                "height_cm": nullable(student.height_cm), "weight_kg": nullable(student.weight_kg), "gender": nullable(student.gender), "contraindications": nullable(student.contraindications)]
            let response = try await api.request("rest/v1/students", method: "PATCH", query: ["id": "eq.\(student.id)", "updated_at": "eq.\(student.updated_at)"], body: values, prefer: "return=representation")
            if let row = try JSONDecoder().decode([Student].self, from: response).first { saved = row }
            else {
                let remote = try await api.request("rest/v1/students", query: ["id": "eq.\(student.id)", "select": "*"])
                guard let row = (try JSONSerialization.jsonObject(with: remote) as? [[String: Any]])?.first,
                      DatabaseAcknowledgement.matches(row: row, intended: values),
                      let typed = try JSONDecoder().decode([Student].self, from: remote).first else { throw APIError.conflict }
                saved = typed
            }
        }
        data.students.removeAll { $0.id == saved.id }; data.students.append(saved)
    }
    func createInvitation(name: String, existing: Relationship? = nil) async throws -> String {
        try requireTrainer()
        guard name.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 else { throw APIError.message("Введи имя ученика, минимум 2 символа.") }
        guard !isDemo, let api else { throw APIError.message("Приглашения доступны после входа в рабочий аккаунт.") }
        struct Invitation: Decodable { var token: String; var expiresAt: String }
        let invitation: Invitation
        if let existing { invitation = try await api.rpc("create_student_invitation", ["p_relationship_id": existing.id]) }
        else { invitation = try await api.rpc("create_student_with_invitation", ["p_name": name.trimmingCharacters(in: .whitespacesAndNewlines), "p_color": "orange", "p_timezone": TimeZone.current.identifier]) }
        try await loadData()
        return api.configuration.webURL.absoluteString + "#/invite/" + invitation.token
    }
    func savePayment(id: String, relationshipID: String, lessons: Int, amount: Double, method: String, date: Date, comment: String, original: SubscriptionEntry? = nil) async throws {
        try requireTrainer()
        guard lessons > 0, amount.isFinite, amount >= 0 else { throw APIError.message("Проверь количество занятий и сумму.") }
        var values: [String: Any] = ["lesson_delta": lessons, "amount_rub": amount, "payment_method": method,
            "occurred_at": ReppyDate.timestamp(date), "comment": comment]
        let entry: SubscriptionEntry
        if isDemo {
            values["id"] = id; values["relationship_id"] = relationshipID; values["kind"] = "payment"
            values["created_at"] = original?.created_at ?? ReppyDate.timestamp(); values["revision"] = (original?.revision ?? 0) + 1
            entry = try decodeObject(values)
        } else {
            guard let api else { throw APIError.signedOut }
            if let original { entry = try await api.update("subscription_entries", id: id, revision: original.revision, values: values) }
            else {
                values["id"] = id; values["relationship_id"] = relationshipID; values["kind"] = "payment"
                try await api.insert("subscription_entries", values); try await loadData(); return
            }
        }
        data.subscriptions.removeAll { $0.id == id }; data.subscriptions.append(entry)
    }
    func deletePayment(_ entry: SubscriptionEntry) async throws {
        try requireTrainer()
        if !isDemo, let api {
            do { try await api.call("delete_subscription_payment", ["p_entry_id": entry.id, "p_expected_revision": entry.revision]) }
            catch APIError.conflict {
                let entries: [SubscriptionEntry] = try await api.rows("subscription_entries", query: ["id": "eq.\(entry.id)"])
                let relationships: [Relationship] = try await api.rows("trainer_student_relationships", query: ["id": "eq.\(entry.relationship_id)"])
                guard entries.isEmpty, let relationship = relationships.first, relationship.status != "archived",
                      relationship.trainer_id == profile?.id, api.session?.user.id == profile?.id else { throw APIError.conflict }
            }
        }
        data.subscriptions.removeAll { $0.id == entry.id }
    }
    func deleteSubscription(_ relationshipID: String) async throws {
        try requireTrainer()
        if !isDemo, let api { try await api.call("delete_subscription", ["p_relationship_id": relationshipID]) }
        data.subscriptions.removeAll { $0.relationship_id == relationshipID }
    }
    func saveDefinition(_ definition: ExerciseDefinition, isNew: Bool) async throws {
        try requireTrainer()
        guard !definition.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw APIError.message("Укажи название упражнения.") }
        if !isDemo, let api {
            let values: [String: Any] = ["name": definition.name.trimmingCharacters(in: .whitespacesAndNewlines), "primary_muscle": definition.muscle_groups.first ?? "Другое",
                "muscle_groups": definition.muscle_groups, "equipment": definition.equipment, "load_mode": definition.load_mode.rawValue, "measure_type": definition.measure_type.rawValue]
            if isNew { var insert = values; insert["id"] = definition.id; insert["owner_id"] = profile?.id; try await api.insert("exercise_definitions", insert) }
            else { _ = try await api.request("rest/v1/exercise_definitions", method: "PATCH", query: ["id": "eq.\(definition.id)", "owner_id": "eq.\(profile!.id)"], body: values) }
        }
        data.definitions.removeAll { $0.id == definition.id }; data.definitions.append(definition)
    }
    func videoURL(_ video: InstructionVideo) async throws -> URL {
        guard !isDemo, let api else { throw APIError.message("Видео доступно в рабочем аккаунте.") }
        struct Metadata: Decodable { var object_path: String }
        let rows: [Metadata] = try await api.rows("instruction_videos", query: ["id": "eq.\(video.id)"])
        guard let path = rows.first?.object_path else { throw APIError.message("Видео не найдено.") }
        let response = try await api.request("storage/v1/object/sign/instruction-videos/\(path)", method: "POST", body: ["expiresIn": 600])
        struct Signed: Decodable { var signedURL: String }
        let signed = try JSONDecoder().decode(Signed.self, from: response)
        guard let url = URL(string: api.configuration.url.absoluteString + "/storage/v1" + signed.signedURL) else { throw APIError.invalidResponse }
        return url
    }
    func uploadVideo(_ url: URL, relationshipID: String) async throws -> InstructionVideo {
        try requireTrainer()
        guard !isDemo, let api else { throw APIError.message("Загрузка видео доступна в рабочем аккаунте.") }
        let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size > 0, size <= 100 * 1024 * 1024 else { throw APIError.message("Выбери видео размером до 100 МБ.") }
        let id = UUID().uuidString.lowercased(); let name = url.lastPathComponent
        let ext = url.pathExtension.lowercased()
        guard ["mov", "mp4", "webm"].contains(ext) else { throw APIError.message("Выбери видео MP4, MOV или WebM размером до 100 МБ.") }
        let mime = ext == "mov" ? "video/quicktime" : ext == "webm" ? "video/webm" : "video/mp4"
        let path = "\(relationshipID)/\(id)/instruction.\(ext)"
        try await api.upload("storage/v1/object/instruction-videos/\(path)", file: url, contentType: mime)
        do {
            try await api.insert("instruction_videos", ["id": id, "relationship_id": relationshipID, "uploaded_by": profile!.id,
                "object_path": path, "file_name": name, "mime_type": mime, "byte_size": size])
        } catch {
            _ = try? await api.request("storage/v1/object/instruction-videos", method: "DELETE", body: ["prefixes": [path]])
            throw error
        }
        return InstructionVideo(id: id, name: name, mimeType: mime, size: size, createdAt: ReppyDate.timestamp())
    }
}
func decodeObject<T: Decodable>(_ object: [String: Any]) throws -> T {
    try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: object))
}
