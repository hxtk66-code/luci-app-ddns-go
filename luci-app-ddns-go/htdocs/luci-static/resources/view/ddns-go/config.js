/*   Copyright (C) 2022-2026 sirpdboy herboy2008@gmail.com*/
'use strict';
'require view';
'require fs';
'require dom';
'require ui';
'require uci';
'require form';
'require poll';
'require rpc';

const getDDNSGoInfo = rpc.declare({
    object: 'luci.ddns-go',
    method: 'get_ver',
    expect: { 'ver': {} }
});

const getUpdateInfo = rpc.declare({
    object: 'luci.ddns-go',
    method: 'last_update',
    expect: { 'update': {} }
});

const updateMessageMap = {
    'Already the latest version': _('Already the latest version'),
    'New version available': _('New version available'),
    'Update successful': _('Update successful'),
    'Download update failed': _('Download update failed'),
    'Update check failed': _('Update check failed'),
    'Update status unknown': _('Update status unknown')
};

/* Parse the "key=value" lines emitted by /usr/libexec/ddns-go-alidns. */
function parseKeyValue(text) {
    var out = {};
    String(text || '').split('\n').forEach(function(line) {
        var i = line.indexOf('=');
        if (i > 0)
            out[line.slice(0, i).trim()] = line.slice(i + 1);
    });
    return out;
}

/* Render the helper's status report: what UCI asks for, what really landed
   in ddns-go-config.yaml, and the last result ddns-go logged. */
function renderLineStatus(kv) {
    if (!kv || kv.ok !== '1')
        return E('div', {}, E('span', {
            'style': 'color:var(--color-text-warning)'
        }, _('Status unavailable') + ': ' +
            ((kv && kv.error) || _('Helper did not respond'))));

    var rows = [], head, headColor;

    if (kv.config !== 'present') {
        head = _('ddns-go configuration not found. Save your AccessKey and domains in the ddns-go web interface first.');
        headColor = 'var(--color-text-warning)';
    } else if (kv.enabled !== '1') {
        head = _('Line parameters disabled. Domains in ddns-go-config.yaml are left untouched.');
        headColor = 'var(--color-text-secondary)';
    } else if (kv.in_sync !== '1') {
        head = _('Pending: settings are saved but not written into ddns-go-config.yaml yet. Click Apply now or Save & Apply.');
        headColor = 'var(--color-text-warning)';
    } else if (kv.service !== 'running') {
        head = _('Parameters are in ddns-go-config.yaml, but ddns-go is not running.');
        headColor = 'var(--color-text-warning)';
    } else {
        head = _('Parameters are applied and ddns-go is running.');
        headColor = 'var(--color-text-success)';
    }
    rows.push(E('p', { 'style': 'color:' + headColor + ';font-weight:500' }, head));

    function addRow(label, value) {
        rows.push(E('div', { 'style': 'margin:2px 0' }, [
            E('strong', {}, label + ': '),
            E('span', {}, value)
        ]));
    }

    var stateText = {
        applied: _('Applied'),
        pending: _('Pending'),
        disabled: _('Disabled'),
        missing: _('Config missing')
    };

    addRow(_('Expected parameters'),
        kv.enabled === '1' ? (kv.expected || '-') : '-');
    addRow(_('Service'), kv.service === 'running' ? _('RUNNING') : _('NOT RUNNING'));
    addRow(_('Config state'), stateText[kv.state] || kv.state || '-');
    addRow(_('Last applied'), kv.last_apply || _('Never'));

    var domains = [];
    for (var i = 1; kv['domain' + i] !== undefined; i++)
        domains.push(E('div', { 'style': 'margin-left:12px' },
            E('code', { 'style': 'word-break:break-all' }, kv['domain' + i])));
    if (!domains.length)
        domains.push(E('span', {}, _('No alidns domains found in ddns-go-config.yaml.')));
    rows.push(E('div', { 'style': 'margin-top:6px' }, [
        E('strong', {}, _('Domains in ddns-go-config.yaml') + ':'),
        E('div', {}, domains)
    ]));

    var submitText = {
        success: _('Last submission: succeeded'),
        failed: _('Last submission: failed'),
        unchanged: _('Last submission: IP unchanged, no update needed'),
        unknown: _('Last submission: no record found in the log')
    }[kv.submit] || _('Last submission: unknown');
    var submitColor = kv.submit === 'failed' ? 'var(--color-text-danger)' :
                      kv.submit === 'success' ? 'var(--color-text-success)' :
                      'var(--color-text-secondary)';
    rows.push(E('div', { 'style': 'margin-top:6px;color:' + submitColor }, submitText));
    if (kv.submit_detail)
        rows.push(E('div', { 'style': 'margin-left:12px;word-break:break-all' },
            E('code', {}, kv.submit_detail)));

    return E('div', { 'style': 'line-height:1.6' }, rows);
}

function fetchLineStatus() {
    var node = document.getElementById('alidns_status');
    if (!node) return Promise.resolve();
    return fs.exec('/usr/libexec/ddns-go-alidns', ['status'])
        .then(function(res) {
            dom.content(node, renderLineStatus(parseKeyValue(res.stdout)));
        })
        .catch(function(err) {
            dom.content(node, E('span', {
                'style': 'color:var(--color-text-warning)'
            }, _('Status unavailable') + ': ' + (err.message || String(err))));
        });
}

/* Mirror of the shell helper, used only for the UI preview. */
function buildLineParams() {
    var params = [];
    var line = uci.get('ddns-go', 'alidns', 'line') || 'default';
    if (line === 'custom')
        line = uci.get('ddns-go', 'alidns', 'line_code') || '';
    if (line) params.push('Line=' + line);
    var rid = uci.get('ddns-go', 'alidns', 'record_id') || '';
    if (rid) params.push('RecordId=' + rid);
    var lang = uci.get('ddns-go', 'alidns', 'lang') || '';
    if (lang) params.push('Lang=' + lang);
    var extra = uci.get('ddns-go', 'alidns', 'extra_params') || '';
    if (extra) params.push(extra);
    return params;
}

async function checkProcess() {
    try {
        const pidofRes = await fs.exec('/bin/pidof', ['ddns-go']);
        if (pidofRes.code === 0) {
            return {
                running: true,
                pid: pidofRes.stdout.trim()
            };
        }
    } catch (err) {
    }
    try {
        const psRes = await fs.exec('/bin/ps', ['-C', 'ddns-go', '-o', 'pid=']);
        const pid = psRes.stdout.trim();
        return {
            running: pid !== '',
            pid: pid || null
        };
    } catch (err) {
        return { running: false, pid: null };
    }
}

function getVersionInfo() {
    return L.resolveDefault(getDDNSGoInfo(), {}).then(function(result) {
        return result || {};
    }).catch(function(error) {
        console.error('Failed to get version:', error);
        return {};
    });
}

function checkUpdateStatus() {
    return L.resolveDefault(getUpdateInfo(), {}).then(function(result) {
        return result || {};
    }).catch(function(error) {
        console.error('Failed to get update info:', error);
        return {};
    });
}
function extractPortNumber(portValue) {
    if (!portValue) return '9876';
    if (portValue.includes(':')) {
        var parts = portValue.split(':');
        return parts[parts.length - 1];
    }
    return portValue;
}

function renderStatus(isRunning, listen_port, noweb, version) {
    var statusText = isRunning ? _('RUNNING') : _('NOT RUNNING');
    var color = isRunning ? 'green' : 'red';
    var icon = isRunning ? '✓' : '✗';
    var versionText = version ? `v${version}` : '';
    
    var html = String.format(
        '<em><span style="color:%s">%s <strong>%s %s - %s</strong></span></em>',
        color, icon, _('DDNS-Go'), versionText, statusText
    );
    
    if (isRunning) {
        html += String.format('&#160;<a class="btn cbi-button" href="http://%s:%s" target="_blank">%s</a>', 
             window.location.hostname, listen_port, _('Open Web Interface'));
    }
    
    return html;
}

function renderUpdateStatus(updateInfo) {
    if (!updateInfo || !updateInfo.status) {
        return '<span style="color:orange"> ⚠ ' + _('Update status unknown') + '</span>';
    }
    
    var status = updateInfo.status;
    var message = updateInfo.message || '';
    
    for (let [en, zh] of Object.entries(updateMessageMap)) {
        if (message.includes(en)) {
            message = message.replace(en, zh);
            break;
        }
    }
    
    switch(status) {
        case 'updated':
            return String.format('<span style="color:green">✓ %s</span>', message);
        case 'update_available':
            return String.format('<span style="color:blue">↻ %s</span>', message);
        case 'latest':
            return String.format('<span style="color:green">✓ %s</span>', message);
        case 'download_failed':
        case 'check_failed':
            return String.format('<span style="color:red">✗ %s</span>', message);
        default:
            return String.format('<span style="color:orange">? %s</span>', message);
    }
}

return view.extend({
    load: function() {
        return Promise.all([
            uci.load('ddns-go')
        ]);
    },
    
    handleResetPassword: async function () {
        try {
            ui.showModal(_('Resetting Password'), [
                E('p', { 'class': 'spinning' }, _('Resetting admin username and password, please wait...'))
            ]);
            const result = await fs.exec('/usr/bin/ddns-go', ['-resetPassword', 'admin12345', '-c', '/etc/ddns-go/ddns-go-config.yaml']);
            const configFile = '/etc/ddns-go/ddns-go-config.yaml';
            const readResult = await fs.read(configFile);
            if (readResult && readResult.trim() !== '') {
                let configContent = readResult;
                configContent = configContent.replace(/(username:\s*).*/g, '$1admin');
                
                if (!configContent.includes('user:')) {
                    configContent += '\nuser:\n    username: admin\n    password: $2a$10$G1xO1cVUYtSpPYwV/Jk3l.u7PxLUxo03wntWG6VA9BxAftNWfZEhK';
                }
                
                await fs.write(configFile, configContent);
            }

            ui.hideModal();

            if (result.code === 0) {
                ui.showModal(_('Username and Password Reset Successful'), [
                    E('p', _('Username: admin, Password: admin12345')),
                    E('p', _('You need to restart DDNS-Go service for the changes to take effect.')),
                    E('div', { 'class': 'right' }, [
                        E('button', {
                            'class': 'btn cbi-button cbi-button-positive',
                            'click': ui.createHandlerFn(this, function() {
                                ui.hideModal();
                                this.handleRestartService();
                            })
                        }, _('Restart Service Now')),
                        ' ',
                        E('button', {
                            'class': 'btn cbi-button cbi-button-neutral',
                            'click': ui.hideModal
                        }, _('Restart Later'))
                    ])
                ]);
            } else {
                ui.showModal(_('Partial Reset'), [
                    E('p', _('DDNS-Go command reset may have failed, but configuration file has been updated.')),
                    E('p', _('Username: admin, Password: admin12345')),
                    E('p', _('You may need to restart DDNS-Go service manually.')),
                    E('div', { 'class': 'right' }, [
                        E('button', {
                            'class': 'btn cbi-button cbi-button-positive',
                            'click': ui.createHandlerFn(this, function() {
                                ui.hideModal();
                                this.handleRestartService();
                            })
                        }, _('Restart Service Now')),
                        ' ',
                        E('button', {
                            'class': 'btn cbi-button cbi-button-neutral',
                            'click': ui.hideModal
                        }, _('Close'))
                    ])
                ]);
            }
            
        } catch (error) {
            ui.hideModal();
            alert(_('ERROR:') + '\n' + _('Reset username/password failed:') + '\n' + error.message);
        }
    },
 
    handleRestartService: async function() {
    try {
        // const enabledValue = document.querySelector('input[name="cfg001c48.enabled"]')?.checked ? '1' : '0';
	const enabledValue = document.querySelectorAll('input[id="widget.cbid.ddns-go.config.enabled"]')?.checked ? '1' : '0';

        await uci.set('ddns-go', 'config', 'enabled', enabledValue);
        await uci.save('ddns-go');
        await uci.apply();
        
        await fs.exec('/etc/init.d/ddns-go', ['stop']);
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (enabledValue === '1') {
            await fs.exec('/etc/init.d/ddns-go', ['start']);
        }
        
        alert(_('SUCCESS:') + '\n' + _('DDNS-Go service restarted successfully'));
        if (window.statusPoll) {
            window.statusPoll();
        }
    } catch (error) {
        alert(_('ERROR:') + '\n' + _('Failed to restart service:') + '\n' + error.message);
    }
    },

    handleUpdate: async function () {
        try {
            var updateView = document.getElementById('update_status');
            if (updateView) {
                updateView.innerHTML = '<span class="spinning"></span> ' + _('Updating, please wait...');
            }
            const updateInfo = await checkUpdateStatus();
            if (updateView) {
                updateView.innerHTML = renderUpdateStatus(updateInfo);
            }

            if (updateInfo.update_successful || updateInfo.status === 'updated') {
                if (window.statusPoll) {
                    window.statusPoll();
                }
                
                setTimeout(() => {
                    var updateView = document.getElementById('update_status');
                    if (updateView) {
                        getVersionInfo().then(function(versionInfo) {
                            var version = versionInfo.version || '';
                            updateView.innerHTML = String.format('<span style="color:green">✓ %s v%s</span>', 
                                _('Current Version'), version);
                        });
                    }
                }, 3000);
            }

        } catch (error) {
            console.error('Update failed:', error);
            var updateView = document.getElementById('update_status');
            if (updateView) {
                updateView.innerHTML = '<span style="color:red">✗ ' + _('Update failed') + '</span>';

                setTimeout(() => {
                    getVersionInfo().then(function(versionInfo) {
                        var version = versionInfo.version || '';
                        updateView.innerHTML = String.format('<span>%s v%s</span>', 
                            _('Current Version'), version);
                    });
                }, 5000);
            }
        }
    },

    /* alidns:AddCustomLine - create a custom line and keep its LineCode. */
    handleCreateLine: function() {
        var domainInput = E('input', { 'type': 'text', 'class': 'cbi-input-text' });
        var nameInput = E('input', { 'type': 'text', 'class': 'cbi-input-text' });
        var segInput = E('input', { 'type': 'text', 'class': 'cbi-input-text' });
        var status = E('div', { 'style': 'margin-top: 8px' });

        domainInput.value = uci.get('ddns-go', 'alidns', 'domain') || '';
        nameInput.value = uci.get('ddns-go', 'alidns', 'custom_line_name') || '';
        segInput.value = uci.get('ddns-go', 'alidns', 'ip_segments') || '';
        [domainInput, nameInput, segInput].forEach(function(el) {
            el.style.width = '100%';
            el.style.margin = '2px 0 8px';
        });

        ui.showModal(_('Create custom line (AddCustomLine)'), [
            E('p', {}, _('Calls alidns:AddCustomLine with the AccessKey already stored in ddns-go-config.yaml. IP segments of all custom lines under one domain must not overlap.')),
            E('label', {}, _('Domain name')), domainInput,
            E('label', {}, _('Custom line name')), nameInput,
            E('label', {}, _('IP segments')), segInput,
            E('small', {}, _('Format: 192.0.2.0-192.0.2.254,198.51.100.0-198.51.100.255')),
            status,
            E('div', { 'class': 'right' }, [
                E('button', {
                    'class': 'btn cbi-button cbi-button-positive',
                    'click': async function() {
                        status.textContent = _('Creating, please wait...');
                        try {
                            var res = await fs.exec('/usr/libexec/ddns-go-alidns', [
                                'create_line',
                                domainInput.value.trim(),
                                nameInput.value.trim(),
                                segInput.value.trim()
                            ]);
                            var kv = parseKeyValue(res.stdout);
                            if (kv.ok !== '1')
                                throw new Error(kv.error || _('Unknown error'));

                            await uci.set('ddns-go', 'alidns', 'line', 'custom');
                            await uci.set('ddns-go', 'alidns', 'line_code', kv.linecode);
                            await uci.set('ddns-go', 'alidns', 'domain', domainInput.value.trim());
                            await uci.set('ddns-go', 'alidns', 'custom_line_name', nameInput.value.trim());
                            await uci.set('ddns-go', 'alidns', 'ip_segments', segInput.value.trim());
                            await uci.save('ddns-go');
                            await uci.apply();

                            status.textContent = String.format('%s %s. %s',
                                _('Custom line created:'), kv.linecode,
                                _('Reload this page to refresh the fields.'));
                            fetchLineStatus();
                        } catch (err) {
                            status.textContent = _('ERROR:') + ' ' + (err.message || String(err));
                        }
                    }
                }, _('Create')),
                ' ',
                E('button', { 'class': 'btn cbi-button cbi-button-neutral', 'click': ui.hideModal }, _('Close'))
            ])
        ]);
    },

    /* Save the form, commit UCI, then let the helper append the parameters
       after ddns-go has produced its own configuration, and restart ddns-go.
       uci.apply() is required: map.save() only writes the UCI delta, while
       the helper is a separate process that must see the committed values. */
    handleApplyLine: function(map) {
        return Promise.resolve(map && typeof map.save === 'function' ? map.save() : null)
            .then(function() {
                return uci.apply();
            })
            .then(function() {
                return fs.exec('/usr/libexec/ddns-go-alidns', ['apply']);
            })
            .then(function(res) {
                var kv = parseKeyValue(res.stdout);
                if (kv.ok !== '1')
                    throw new Error(kv.error || (res.stderr || '').trim() || _('Apply failed'));
                return fs.exec('/etc/init.d/ddns-go', ['restart']);
            })
            .then(function() {
                return fs.exec('/usr/libexec/ddns-go-alidns', ['status']);
            })
            .then(function(res) {
                ui.showModal(_('Alidns line applied'), [
                    E('p', {}, _('The line parameters were written to ddns-go-config.yaml and the service was restarted.')),
                    renderLineStatus(parseKeyValue(res.stdout)),
                    E('div', { 'class': 'right' }, [
                        E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, _('Close'))
                    ])
                ]);
                return fetchLineStatus();
            })
            .catch(function(err) {
                ui.showModal(_('ERROR:'), [
                    E('p', {}, err.message || String(err)),
                    E('div', { 'class': 'right' }, [
                        E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, _('Close'))
                    ])
                ]);
            });
    },

    /* Clearing must also turn the UCI switch off, otherwise the next service
       restart (and the init hook) would inject the parameters again. */
    handleClearLine: function() {
        return Promise.resolve(uci.set('ddns-go', 'alidns', 'enabled', '0'))
            .then(function() { return uci.save(); })
            .then(function() { return uci.apply(); })
            .then(function() {
                return fs.exec('/usr/libexec/ddns-go-alidns', ['clear']);
            })
            .then(function(res) {
                var kv = parseKeyValue(res.stdout);
                if (kv.ok !== '1')
                    throw new Error(kv.error || _('Clear failed'));
                return fs.exec('/etc/init.d/ddns-go', ['restart']);
            })
            .then(function() {
                var cb = document.querySelector('input[id="widget.cbid.ddns-go.alidns.enabled"]');
                if (cb) cb.checked = false;
                alert(_('Line parameters removed from ddns-go-config.yaml.'));
                return fetchLineStatus();
            })
            .catch(function(err) {
                alert(_('ERROR:') + '\n' + (err.message || String(err)));
            });
    },

    render: function(data) {
        var m, s, o;
        
        var portValue = uci.get('ddns-go', 'config', 'port') || '[::]:9876';
        var listen_port = extractPortNumber(portValue);
        var noweb = uci.get('ddns-go', 'config', 'noweb') || '0';

        m = new form.Map('ddns-go', _('DDNS-GO'),
            _('DDNS-GO automatically obtains your public IPv4 or IPv6 address and resolves it to the corresponding domain name service.'));

        s = m.section(form.TypedSection);
        s.anonymous = true;
   
        s.render = function() {
            var statusView = E('p', { id: 'control_status' }, 
                '<span class="spinning"></span> ' + _('Checking status...'));
            
            window.statusPoll = function() {
                return Promise.all([
                    checkProcess(),
                    getVersionInfo()
                ]).then(function(results) {
                    var [processInfo, versionInfo] = results;
                    var version = versionInfo.version || '';
                    statusView.innerHTML = renderStatus(processInfo.running, listen_port, noweb, version);
                }).catch(function(err) {
                    console.error('Status check failed:', err);
                    statusView.innerHTML = '<span style="color:orange">⚠ ' + _('Status check error') + '</span>';
                });
            };
            
            poll.add(window.statusPoll, 5);
            
            return E('div', { class: 'cbi-section', id: 'status_bar' }, [
                statusView
            ]);
        };

        s = m.section(form.NamedSection, 'config', 'basic');

        o = s.option(form.Flag, 'enabled', _('Enable'));
        o.default = o.disabled;
        o.rmempty = false;

        o = s.option(form.Value, 'port', _('Listen port'));
        o.default = '9876';
        o.rmempty = false;
        o.datatype = 'string'; 
        o.description = _('Port number (1-65535)');

        o = s.option(form.Value, 'time', _('Update interval (seconds)'));
        o.default = '300';
        o.datatype = 'range(60,86400)'; 
        o.description = _('Update interval in seconds (60-86400)');

        o = s.option(form.Value, 'ctimes', _('Provider comparison interval'));
        o.default = '5';
        o.datatype = 'range(1,60)';
        o.description = _('Number of times to compare with service provider (1-60)');

        o = s.option(form.Value, 'skipverify', _('Skip verifying certificates'));
        o.default = '0';
        o.value('0', _('No'));
        o.value('1', _('Yes'));

        o = s.option(form.Value, 'dns', _('Specify DNS resolution server'));
        o.value('223.5.5.5', _('Ali DNS 223.5.5.5'));
        o.value('223.6.6.6', _('Ali DNS 223.6.6.6'));
        o.value('119.29.29.29', _('Tencent DNS 119.29.29.29'));
        o.value('1.1.1.1', _('CloudFlare DNS 1.1.1.1'));
        o.value('8.8.8.8', _('Google DNS 8.8.8.8'));
        o.value('8.8.4.4', _('Google DNS 8.8.4.4'));
        o.datatype = 'ipaddr'; 

        o = s.option(form.Flag, 'noweb', _('Do not start web services'));
        o.default = '0';
        o.rmempty = false;

        o = s.option(form.Value, 'delay', _('Delayed Start (seconds)'));
        o.default = '60';
    
        o = s.option(form.Button, '_newpassword', _('Reset account password'));
        o.inputtitle = _('Reset');
        o.inputstyle = 'apply';
        o.onclick = L.bind(this.handleResetPassword, this, data);

        o = s.option(form.Button, '_update', _('Check Update'));
        o.inputtitle = _('Check');
        o.inputstyle = 'apply';
        o.onclick = L.bind(this.handleUpdate, this, data);

        o = s.option(form.DummyValue, '_update_status', _('Current Version'));
        o.rawhtml = true;
        
        var currentVersion = '';
	
        getVersionInfo().then(function(versionInfo) {
            currentVersion = versionInfo.version || '';
            var updateView = document.getElementById('update_status');
            if (updateView) {
                updateView.innerHTML = String.format('<span>v%s</span>', currentVersion);
            }
        });
        
        o.cfgvalue = function() {
            return E('div', { style: 'margin: 5px 0;' }, [
                E('span', { id: 'update_status' }, 
                    currentVersion ? String.format('v%s', currentVersion) : _('Loading...'))
            ]);
        };
        
        /* Alidns line & extended options.
           ddns-go keeps its own configuration; this section only appends
           query parameters to the domains ddns-go has already saved. */
        s = m.section(form.NamedSection, 'alidns', 'alidns',
            _('Alidns Line & Extended Options'),
            _('Append Line and other API parameters to the domains already configured in ddns-go. Disabled by default; ddns-go itself is never modified.'));

        o = s.option(form.Flag, 'enabled', _('Apply line parameters'));
        o.default = o.disabled;
        o.rmempty = false;
        o.description = _('Rewrite the domain entries in ddns-go-config.yaml with the parameters below. Requires a service restart.');

        o = s.option(form.ListValue, 'line', _('DNS line (Line)'));
        o.description = _('Line CODE passed to alidns:AddDomainRecord / UpdateDomainRecord. See the Alibaba Cloud line enumeration.');
        o.value('default', _('Default (default)'));
        o.value('telecom', _('China Telecom (telecom)'));
        o.value('unicom', _('China Unicom (unicom)'));
        o.value('mobile', _('China Mobile (mobile)'));
        o.value('edu', _('China Education Network (edu)'));
        o.value('drpeng', _('Dr.Peng (drpeng)'));
        o.value('btvn', _('China Broadcasting Network (btvn)'));
        o.value('cstnet', _('CSTNET (cstnet)'));
        o.value('aliyun', _('Alibaba Cloud (aliyun)'));
        o.value('search', _('Search engine (search)'));
        o.value('oversea', _('Outside mainland China (oversea)'));
        o.value('internal', _('Mainland China (internal)'));
        o.value('custom', _('Custom line (LineCode)'));
        o.default = 'default';
        o.rmempty = false;

        o = s.option(form.Value, 'line_code', _('Custom line code'));
        o.depends('line', 'custom');
        o.placeholder = 'hra0yc-597';
        o.description = _('LineCode returned by alidns:AddCustomLine, e.g. hra0yc-597. Create one with the button below.');

        o = s.option(form.Value, 'record_id', _('RecordId (optional)'));
        o.description = _('Bind to a specific existing record. Useful when one domain has several records.');

        o = s.option(form.ListValue, 'lang', _('API language (Lang)'));
        o.value('', _('Not set (use ddns-go default)'));
        o.value('zh', _('Chinese (zh)'));
        o.value('en', _('English (en)'));
        o.default = '';

        o = s.option(form.Value, 'extra_params', _('Extra API parameters'));
        o.placeholder = 'UserClientIp=192.0.2.1';
        o.description = _('Extra parameters appended to the domain, e.g. UserClientIp=192.0.2.1&Priority=5. Do not set TTL here, ddns-go controls it.');

        o = s.option(form.ListValue, 'apply_to', _('Apply to'));
        o.value('all', _('IPv4 and IPv6 domains'));
        o.value('ipv4', _('IPv4 domains only'));
        o.value('ipv6', _('IPv6 domains only'));
        o.default = 'all';

        /* Live status: UCI vs. what actually landed in the YAML, plus the
           last provider submission result read from ddns-go's log. */
        o = s.option(form.DummyValue, '_line_status', _('Effective & submission status'));
        o.rawhtml = true;
        o.cfgvalue = function() {
            return E('div', { 'id': 'alidns_status', 'style': 'line-height:1.6' }, [
                E('span', { 'class': 'spinning' }), ' ', _('Checking status...')
            ]);
        };

        o = s.option(form.DummyValue, '_line_preview', _('Resulting domain parameter'));
        o.rawhtml = true;
        o.cfgvalue = function() {
            var p = buildLineParams();
            return E('code', { 'style': 'word-break: break-all' },
                'example.com' + (p.length ? '?' + p.join('&') : ''));
        };

        o = s.option(form.Value, 'domain', _('Domain name for custom line'));
        o.description = _('Main domain used by alidns:AddCustomLine, e.g. example.com.');

        o = s.option(form.Value, 'custom_line_name', _('Custom line name'));
        o.placeholder = _('Beijing line');

        o = s.option(form.Value, 'ip_segments', _('IP segments'));
        o.placeholder = '192.0.2.0-192.0.2.254';
        o.description = _('Format: 192.0.2.0-192.0.2.254,198.51.100.0-198.51.100.255');

        o = s.option(form.Button, '_create_line', _('Custom line'));
        o.inputtitle = _('Create');
        o.inputstyle = 'apply';
        o.description = _('Calls alidns:AddCustomLine using the AccessKey already stored in ddns-go-config.yaml.');
        o.onclick = L.bind(this.handleCreateLine, this);

        o = s.option(form.Button, '_apply_line', _('Apply now'));
        o.inputtitle = _('Apply');
        o.inputstyle = 'apply';
        o.description = _('Save these settings, append the parameters to ddns-go-config.yaml and restart the service.');
        o.onclick = L.bind(this.handleApplyLine, this, m);

        o = s.option(form.Button, '_clear_line', _('Clear line parameters'));
        o.inputtitle = _('Clear');
        o.inputstyle = 'remove';
        o.description = _('Remove the parameters managed by this plugin from ddns-go-config.yaml and restart the service.');
        o.onclick = L.bind(this.handleClearLine, this);

        /* LuCI's own "Save & Apply" only commits UCI. Wrap it so a plain form
           submit also finishes the injection and restarts ddns-go, no matter
           how this system's reload trigger happens to be wired. */
        if (typeof m.handleSaveApply === 'function') {
            var saveApply = m.handleSaveApply.bind(m);
            m.handleSaveApply = function(ev) {
                return Promise.resolve(saveApply(ev))
                    .then(function() {
                        return fs.exec('/usr/libexec/ddns-go-alidns', ['apply']);
                    })
                    .then(function(res) {
                        var kv = parseKeyValue(res.stdout);
                        if (kv.ok !== '1')
                            throw new Error(kv.error || (res.stderr || '').trim() || _('Apply failed'));
                        return fs.exec('/etc/init.d/ddns-go', ['restart']);
                    })
                    .then(fetchLineStatus)
                    .catch(function(err) {
                        ui.showModal(_('ERROR:'), [
                            E('p', {}, err.message || String(err)),
                            E('div', { 'class': 'right' }, [
                                E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, _('Close'))
                            ])
                        ]);
                    });
            };
        }

        window.lineStatusPoll = fetchLineStatus;
        poll.add(fetchLineStatus, 5);

        return Promise.resolve(m.render()).then(function(node) {
            setTimeout(fetchLineStatus, 100);
            return node;
        });
    }
});