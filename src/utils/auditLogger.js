const fs = require('fs').promises;
const path = require('path');
const createLogger = require('./logger');

/**
 * File-backed audit logging utilities for administrative, authentication,
 * security, and data-change events.
 *
 * @module utils/auditLogger
 */

/**
 * Writes audit events to daily log files and provides search/report helpers.
 */
class AuditLogger {
    /**
     * Creates an audit logger and ensures the audit log directory exists.
     */
    constructor() {
        this.logger = createLogger('AUDIT');
        this.auditDir = path.join(__dirname, '../../logs/audit');
        this.ensureAuditDir();
    }

    /**
     * Ensures the audit log directory exists.
     *
     * @returns {Promise<void>}
     */
    async ensureAuditDir() {
        try {
            await fs.mkdir(this.auditDir, { recursive: true });
        } catch (error) {
            this.logger.error('Failed to create audit directory:', error.message);
        }
    }

    /**
     * Records an administrative operation.
     *
     * @param {string} operation - Administrative action name.
     * @param {object} user - User who performed the operation.
     * @param {object} [details={}] - Additional request and operation metadata.
     * @returns {Promise<void>}
     */
    async logAdminOperation(operation, user, details = {}) {
        const auditEntry = {
            timestamp: new Date().toISOString(),
            type: 'ADMIN_OPERATION',
            operation,
            user: {
                id: user.id,
                email: user.email,
                role: user.role || 'unknown'
            },
            details,
            ip: details.ip,
            userAgent: details.userAgent,
            sessionId: this.generateSessionId(user.id)
        };

        await this.writeAuditLog(auditEntry);
        this.logger.log(`Admin Operation: ${operation}`, auditEntry);
    }

    /**
     * Records an authentication attempt.
     *
     * @param {string} type - Authentication flow or method.
     * @param {string} email - Email used during authentication.
     * @param {boolean} success - Whether authentication succeeded.
     * @param {object} [details={}] - Additional request metadata.
     * @returns {Promise<void>}
     */
    async logAuthAttempt(type, email, success, details = {}) {
        const auditEntry = {
            timestamp: new Date().toISOString(),
            type: 'AUTH_ATTEMPT',
            authType: type,
            email,
            success,
            details,
            ip: details.ip,
            userAgent: details.userAgent
        };

        await this.writeAuditLog(auditEntry);
        this.logger.log(`Auth Attempt: ${type} - ${success ? 'SUCCESS' : 'FAILED'}`, auditEntry);
    }

    /**
     * Records a security violation.
     *
     * @param {string} violation - Security violation identifier or description.
     * @param {object} [details={}] - Additional violation metadata.
     * @returns {Promise<void>}
     */
    async logSecurityViolation(violation, details = {}) {
        const auditEntry = {
            timestamp: new Date().toISOString(),
            type: 'SECURITY_VIOLATION',
            violation,
            details,
            severity: details.severity || 'MEDIUM',
            ip: details.ip,
            userAgent: details.userAgent
        };

        await this.writeAuditLog(auditEntry);
        this.logger.error(`Security Violation: ${violation}`, auditEntry);
    }

    /**
     * Records an operation performed on sensitive data.
     *
     * @param {string} operation - Data operation name.
     * @param {string} tableName - Database table affected by the operation.
     * @param {string} recordId - Identifier of the affected record.
     * @param {object} user - User who performed the operation.
     * @param {object} [changes={}] - Changed values or change metadata.
     * @returns {Promise<void>}
     */
    async logDataOperation(operation, tableName, recordId, user, changes = {}) {
        const auditEntry = {
            timestamp: new Date().toISOString(),
            type: 'DATA_OPERATION',
            operation,
            table: tableName,
            recordId,
            user: {
                id: user.id,
                email: user.email
            },
            changes,
            sessionId: this.generateSessionId(user.id)
        };

        await this.writeAuditLog(auditEntry);
        this.logger.log(`Data Operation: ${operation} on ${tableName}`, auditEntry);
    }

    /**
     * Appends an audit entry to the daily audit log file.
     *
     * @param {object} entry - Audit entry to persist as a JSON line.
     * @returns {Promise<void>}
     */
    async writeAuditLog(entry) {
        try {
            const fileName = `audit-${new Date().toISOString().split('T')[0]}.log`;
            const filePath = path.join(this.auditDir, fileName);
            const logLine = JSON.stringify(entry) + '\n';
            
            await fs.appendFile(filePath, logLine, 'utf8');
        } catch (error) {
            this.logger.error('Failed to write audit log:', error.message);
        }
    }

    /**
     * Generates a session identifier from a user id and current timestamp.
     *
     * @param {string} userId - User identifier.
     * @returns {string} Generated session identifier.
     */
    generateSessionId(userId) {
        const timestamp = Date.now();
        return `${userId}-${timestamp}`.substring(0, 32);
    }

    /**
     * Searches audit log files using optional filters.
     *
     * @param {object} [filters={}] - Filters applied to audit entries.
     * @param {string|Date} [filters.startDate] - Earliest timestamp to include.
     * @param {string|Date} [filters.endDate] - Latest timestamp to include.
     * @param {string} [filters.type] - Audit event type to include.
     * @param {string} [filters.userId] - User id to include.
     * @param {string} [filters.operation] - Operation name to include.
     * @returns {Promise<Array<object>>} Matching audit entries sorted newest first.
     */
    async searchAuditLogs(filters = {}) {
        try {
            const { startDate, endDate, type, userId, operation } = filters;
            const logs = [];
            
            const files = await fs.readdir(this.auditDir);
            const logFiles = files.filter(file => file.endsWith('.log'));
            
            for (const file of logFiles) {
                const filePath = path.join(this.auditDir, file);
                const content = await fs.readFile(filePath, 'utf8');
                const lines = content.trim().split('\n');
                
                for (const line of lines) {
                    if (!line.trim()) continue;
                    
                    try {
                        const entry = JSON.parse(line);
                        
                        if (startDate && new Date(entry.timestamp) < new Date(startDate)) continue;
                        if (endDate && new Date(entry.timestamp) > new Date(endDate)) continue;
                        if (type && entry.type !== type) continue;
                        if (userId && entry.user?.id !== userId) continue;
                        if (operation && entry.operation !== operation) continue;
                        
                        logs.push(entry);
                    } catch (parseError) {
                        this.logger.error('Failed to parse audit log line:', parseError.message);
                    }
                }
            }
            
            return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        } catch (error) {
            this.logger.error('Failed to search audit logs:', error.message);
            return [];
        }
    }

    /**
     * Deletes audit log files older than the retention period.
     *
     * @param {number} [daysToKeep=90] - Number of days of audit logs to retain.
     * @returns {Promise<number>} Number of deleted log files.
     */
    async cleanOldLogs(daysToKeep = 90) {
        try {
            const files = await fs.readdir(this.auditDir);
            const now = new Date();
            const cutoffDate = new Date(now.getTime() - (daysToKeep * 24 * 60 * 60 * 1000));
            
            let cleaned = 0;
            for (const file of files) {
                if (!file.endsWith('.log')) continue;
                
                const filePath = path.join(this.auditDir, file);
                const stats = await fs.stat(filePath);
                
                if (stats.mtime < cutoffDate) {
                    await fs.unlink(filePath);
                    cleaned++;
                }
            }
            
            if (cleaned > 0) {
                this.logger.log(`Cleaned ${cleaned} old audit log files`);
            }
            
            return cleaned;
        } catch (error) {
            this.logger.error('Failed to clean old audit logs:', error.message);
            return 0;
        }
    }

    /**
     * Generates an activity summary report for the given date range.
     *
     * @param {string|Date} startDate - Report start date.
     * @param {string|Date} endDate - Report end date.
     * @returns {Promise<object>} Activity report grouped by type, user, and operation.
     */
    async generateActivityReport(startDate, endDate) {
        const logs = await this.searchAuditLogs({ startDate, endDate });
        
        const report = {
            period: { start: startDate, end: endDate },
            totalEvents: logs.length,
            byType: {},
            byUser: {},
            byOperation: {},
            securityEvents: 0,
            failedAuth: 0
        };
        
        for (const log of logs) {
            report.byType[log.type] = (report.byType[log.type] || 0) + 1;
            
            if (log.user?.email) {
                report.byUser[log.user.email] = (report.byUser[log.user.email] || 0) + 1;
            }
            
            if (log.operation) {
                report.byOperation[log.operation] = (report.byOperation[log.operation] || 0) + 1;
            }
            
            if (log.type === 'SECURITY_VIOLATION') {
                report.securityEvents++;
            }
            
            if (log.type === 'AUTH_ATTEMPT' && !log.success) {
                report.failedAuth++;
            }
        }
        
        return report;
    }
}

const auditLogger = new AuditLogger();

module.exports = auditLogger;
