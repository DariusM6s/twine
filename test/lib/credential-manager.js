const path = require('path');
const fs = require('fs-extra');
const sinon = require('sinon');
const keytar = require('keytar');
const _ = require('lodash');
const chai = require('chai');
const expect = chai.expect;
const chaiAsPromised = require('chai-as-promised');
const dirtyChai = require('dirty-chai');
const CredentialManager = require('../../lib/credential-manager');

chai.use(chaiAsPromised);
chai.use(dirtyChai);

describe('The credential manager', () => {
	var secrets = {};
	var creds;
	before(() => {
		sinon.stub(keytar, 'setPassword').callsFake((service, key, secret) => {
			_.set(secrets, `${service}.${key}`, secret);
			return Promise.resolve();
		});
		sinon.stub(keytar, 'getPassword').callsFake((service, key) => {
			let value = _.get(secrets, `${service}.${key}`);
			return value ? Promise.resolve(value) : Promise.reject(new Error('Missing consumer secret'));
		});
		sinon.stub(keytar, 'deletePassword').callsFake((service, key) => {
			_.unset(secrets, `${service}.${key}`);
			return Promise.resolve();
		});

		creds = new CredentialManager('twine-test');
	});

	it('should RETURN credentials set in the enviroment', async () => {
		process.env['TWINE-TEST_CONSUMER_KEY'] = 'one';
		process.env['TWINE-TEST_CONSUMER_SECRET'] = 'two';
		let [
			key,
			secret
		] = await creds.getKeyAndSecret('consumer');
		expect(key).to.equal('one');
		expect(secret).to.equal('two');
	});

	it('should PREFER credentials set in the enviroment', async () => {
		await creds.storeKeyAndSercret('consumer', 'foo', 'bar');
		let [
			key,
			secret
		] = await creds.getKeyAndSecret('consumer');
		expect(key).to.equal('one');
		expect(secret).to.equal('two');
		delete process.env['TWINE-TEST_CONSUMER_KEY'];
		delete process.env['TWINE-TEST_CONSUMER_SECRET'];
	});

	it('should RETURN credentials then they are found', async () => {
		await creds.storeKeyAndSercret('consumer', 'foo', 'bar');
		let [
			key,
			secret
		] = await creds.getKeyAndSecret('consumer');
		expect(key).to.equal('foo');
		expect(secret).to.equal('bar');
	});

	it('should reject when NO KEY are found', async () => {
		await creds.clearKeyAndSecret('consumer');
		expect(creds.getKeyAndSecret('consumer')).to.be.rejectedWith('Missing consumer key');
	});

	it('should reject when NO SECRET is found', async () => {
		creds.conf.set('keys.consumer', 'foo');
		await expect(creds.getKeyAndSecret('consumer')).to.be.rejectedWith('Missing consumer secret');
		creds.conf.delete('keys.consumer');
	});

	it('should REMOVE all credentials', async () => {
		await creds.storeKeyAndSercret('consumer', 'one', 'two');
		await creds.storeKeyAndSercret('account', 'three', 'four');
		await creds.clearAll();
		await expect(creds.getKeyAndSecret('consumer')).to.be.rejected();
		await expect(creds.getKeyAndSecret('account')).to.be.rejected();
	});

	after(async () => {
		await creds.clearAll();
		keytar.setPassword.restore();
		keytar.getPassword.restore();
		keytar.deletePassword.restore();
		await fs.unlink(path.join(process.env.HOME, '.config', 'configstore', 'twine-test.json'));
	});
});
