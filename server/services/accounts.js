import { conflict, notFound } from '../lib/errors.js';
import * as validate from '../domain/validation.js';
import { hashPassword } from './password.js';
import { publicAccount } from './auth.js';

export function createAccountsService({ store, sessions, audit }) {
  function list(query = '') {
    const search = String(query || '').trim().toLowerCase();
    const accounts = new Map(
      store
        .list('accounts')
        .filter((account) => account.role === 'employee')
        .map((account) => [account.empId, account]),
    );

    const employees = store
      .list('employees')
      .filter((employee) => {
        if (!search) return true;
        return `${employee.name || ''} ${employee.id} ${employee.job || ''}`
          .toLowerCase()
          .includes(search);
      })
      .sort((a, b) => {
        const activeA = a.active !== false ? 0 : 1;
        const activeB = b.active !== false ? 0 : 1;
        return activeA - activeB || String(a.name).localeCompare(String(b.name), 'ar');
      })
      .map((employee) => ({
        id: employee.id,
        name: employee.name || '',
        job: employee.job || '',
        branch: employee.branch || '',
        active: employee.active !== false,
        avatar: employee.avatar || '',
        account: accounts.has(employee.id) ? publicAccount(accounts.get(employee.id)) : null,
      }));

    return {
      employees,
      withAccount: employees.filter((employee) => employee.account).length,
      withoutAccount: employees.filter((employee) => !employee.account && employee.active)
        .length,
      total: employees.length,
    };
  }

  async function create({ empId, username, password, actor }) {
    const employee = store.get('employees', empId);
    if (!employee) throw notFound('الموظف غير موجود');
    if (employee.active === false) throw conflict('لا يمكن إنشاء حساب لموظف غير ساري');

    if (
      store
        .list('accounts')
        .some((account) => account.role === 'employee' && account.empId === empId)
    ) {
      throw conflict('هذا الموظف لديه حساب بالفعل');
    }

    const name = validate.username(username);
    ensureUsernameFree(name);
    const pass = validate.password(password);

    const account = store.add('accounts', {
      role: 'employee',
      empId,
      username: name,
      usernameLower: name.toLowerCase(),
      name: employee.name,
      password: await hashPassword(pass),
      active: true,
      createdAt: Date.now(),
      createdBy: actor.name || actor.username,
    });

    audit.record({
      actor,
      action: 'account.create',
      target: empId,
      details: `إنشاء حساب ${name}`,
    });

    return publicAccount(account);
  }

  async function resetPassword({ accountId, password, actor }) {
    const account = store.get('accounts', accountId);
    if (!account || account.role !== 'employee') throw notFound('الحساب غير موجود');
    const pass = validate.password(password);
    store.update('accounts', accountId, {
      password: await hashPassword(pass),
      passwordChangedAt: Date.now(),
      passwordChangedBy: actor.name || actor.username,
    });
    audit.record({
      actor,
      action: 'account.reset-password',
      target: account.empId,
      details: `إعادة تعيين كلمة مرور ${account.username}`,
    });
    return publicAccount(store.get('accounts', accountId));
  }

  function setActive({ accountId, active, actor }) {
    const account = store.get('accounts', accountId);
    if (!account || account.role !== 'employee') throw notFound('الحساب غير موجود');
    if (account.active === Boolean(active)) return publicAccount(account);

    store.update('accounts', accountId, { active: Boolean(active) });
    if (!active) sessions.destroyForAccount(accountId);

    audit.record({
      actor,
      action: active ? 'account.enable' : 'account.disable',
      target: account.empId,
      details: `${active ? 'تفعيل' : 'تعطيل'} حساب ${account.username}`,
    });
    return publicAccount(store.get('accounts', accountId));
  }

  function ensureUsernameFree(name) {
    const duplicate = store
      .list('accounts')
      .some((account) => account.usernameLower === name.toLowerCase());
    if (duplicate) throw conflict('اسم المستخدم مستخدم بالفعل');
  }

  return { list, create, resetPassword, setActive };
}
